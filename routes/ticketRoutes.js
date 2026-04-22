const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// RSVP to a free event
router.post('/rsvp', requireAuth, async (req, res) => {
    const { event_id } = req.body;
    if (!event_id || String(event_id) === 'null' || String(event_id) === 'undefined') return res.status(400).json({ error: 'Invalid event ID' });
    try {
        const { data, error } = await supabase
            .from('rsvps')
            .insert([{
                event_id,
                user_id: req.user.id,
                status: 'confirmed'
            }]);

        if (error) throw error;
        res.json({ message: 'RSVP successful', data });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Create Razorpay Order for paid ticket
router.post('/checkout', requireAuth, async (req, res) => {
    const { event_id, ticket_price } = req.body;
    if (!event_id || String(event_id) === 'null' || String(event_id) === 'undefined') return res.status(400).json({ error: 'Invalid event ID' });
    try {
        // Assume ticket_price is in INR (float), Razorpay uses minimum currency unit (paise)
        const amountInPaise = Math.round(ticket_price * 100);

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `receipt_event_${event_id}_usr_${req.user.id.substring(0,8)}`,
        };

        const order = await razorpay.orders.create(options);

        res.json({ orderId: order.id, amount: options.amount, currency: "INR" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Save successful booking after payment
router.post('/book', requireAuth, async (req, res) => {
    const { event_id, order_id, payment_id, amount, quantity = 1 } = req.body;
    if (!event_id || String(event_id) === 'null' || String(event_id) === 'undefined') return res.status(400).json({ error: 'Invalid event ID' });
    
    try {
        const booking_id = 'LOC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const { data, error } = await supabase
            .from('bookings')
            .insert([{
                event_id,
                user_id: req.user.id,
                order_id,
                payment_id,
                amount,
                booking_id,
                quantity: Math.min(Math.max(1, parseInt(quantity)), 10),
                status: 'confirmed'
            }])
            .select();

        if (error) throw error;
        res.status(201).json({ message: 'Booking saved successfully', data: data ? data[0] : null });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 4. Get all bookings for current user
router.get('/my-bookings', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('bookings')
            .select(`
                *,
                events (
                    title,
                    description,
                    location,
                    lat,
                    lng,
                    images,
                    ticket_price,
                    is_cancelled
                )
            `)
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Cancel a booking
router.delete('/bookings/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || String(id) === 'null' || String(id) === 'undefined') return res.status(400).json({ error: 'Invalid booking ID' });
        
        // 1. Verify ownership before deleting
        const { data: booking, error: fetchError } = await supabase
            .from('bookings')
            .select('user_id')
            .eq('id', id)
            .single();

        if (fetchError || !booking) return res.status(404).json({ error: 'Booking not found' });
        if (booking.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized to cancel this booking' });

        // 2. Delete the booking
        const { error: deleteError } = await supabase
            .from('bookings')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;
        res.json({ message: 'Booking cancelled successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verify Ticket (For Organizer Scan)
router.post('/verify', requireAuth, async (req, res) => {
    const { code, event_id: raw_event_id, type = 'entry' } = req.body;
    const event_id = raw_event_id ? raw_event_id.replace(/[^a-zA-Z0-9-]/g, '') : '';
    if (!event_id || event_id === 'null' || event_id === 'undefined') return res.status(400).json({ error: 'Invalid event ID format' });
    console.log(`[VERIFY] Type: "${type}", Scanned Code: "${code}", Sanitzied Event ID: "${event_id}"`);
    try {
        // 1. Verify Event Ownership
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('organizer_id, title')
            .eq('id', event_id)
            .single();

        if (eventError || !event) return res.status(404).json({ error: 'Event not found' });
        if (event.organizer_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
        
        // 2. Find Booking
        const { data: allBookings, error: bookError } = await supabase.from('bookings').select('*');
        if (bookError) throw bookError;
        
        const booking = allBookings.find(b => 
            (b.booking_id === code || b.payment_id === code) && 
            (b.event_id?.toString().trim() === event_id)
        );

        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        
        // 3. Logic based on Type
        if (type === 'food') {
            const currentCount = booking.food_redeemed_count || 0;
            const maxCount = booking.quantity || 1;

            if (currentCount >= maxCount) {
                return res.status(400).json({ error: 'ALREADY ALL REDEEMED', user: 'Attendee' });
            }

            // Update Food Status
            const { error: updE } = await supabase.from('bookings').update({ 
                food_redeemed_count: currentCount + 1, 
                food_redeemed_at: new Date().toISOString() 
            }).eq('id', booking.id);
            
            if (updE) throw updE;

            return res.json({ 
                message: `FOOD GRANTED (${currentCount + 1}/${maxCount})`, 
                user: 'Attendee', 
                booking_id: booking.booking_id 
            });
        } else {
            // Main Entry Logic
            const currentCount = booking.checked_in_count || 0;
            const maxCount = booking.quantity || 1;

            if (currentCount >= maxCount) {
                return res.status(400).json({ error: 'ALREADY ALL ENTERED', user: 'Attendee' });
            }

            const { error: updateError } = await supabase.from('bookings').update({ 
                checked_in_count: currentCount + 1,
                is_checked_in: true, // Keep this for legacy compatibility
                checked_in_at: new Date().toISOString() 
            }).eq('id', booking.id);

            if (updateError) throw updateError;

            return res.json({ 
                message: `ENTRY GRANTED (${currentCount + 1}/${maxCount})`, 
                user: 'Attendee', 
                booking_id: booking.booking_id 
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
