const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

// Get all public events 
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('events')
            .select('*, programs(*), reviews(*)')
            .eq('is_public', true);
            
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get events created by the current user (Private & Public)
router.get('/mine', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('events')
            .select('*, programs(*)')
            .eq('organizer_id', req.user.id);
            
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create event (All authenticated users)
router.post('/', requireAuth, async (req, res) => {
    const { title, description, location, lat, lng, is_public, ticket_price, images, programs, start_date, account_number, ifsc_code } = req.body;
    try {
        const { data: event, error: eventError } = await supabase
            .from('events')
            .insert([{
                title, description, location, lat, lng, is_public, ticket_price, images, start_date, account_number, ifsc_code,
                organizer_id: req.user.id
            }])
            .select()
            .single();
            
        if (eventError) throw eventError;

        if (programs && programs.length > 0) {
            const programsToInsert = programs.map(p => ({
                event_id: event.id,
                title: p.title,
                start_time: p.start_time,
                end_time: p.end_time,
                description: p.description,
                lat: p.lat,
                lng: p.lng
            }));
            const { error: progError } = await supabase.from('programs').insert(programsToInsert);
            if (progError) throw progError;
        }

        res.status(201).json({ message: 'Event created', event });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update event
router.put('/:id', requireAuth, async (req, res) => {
    const { title, description, location, lat, lng, is_public, ticket_price, images, programs, start_date, account_number, ifsc_code } = req.body;
    try {
        const eventId = req.params.id.replace(/[^a-zA-Z0-9-]/g, '');
        if (!eventId || eventId === 'null' || eventId === 'undefined') return res.status(400).json({ error: 'Invalid event ID format' });
        // 1. Check Ownership
        const { data: existing, error: fetchError } = await supabase
            .from('events')
            .select('organizer_id')
            .eq('id', eventId)
            .single();
            
        if (fetchError || !existing) return res.status(404).json({ error: 'Event not found' });
        if (existing.organizer_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

        // 2. Update Event
        const { error: updateError } = await supabase
            .from('events')
            .update({
                title, description, location, lat, lng, is_public, ticket_price, images, start_date, account_number, ifsc_code
            })
            .eq('id', eventId);
            
        if (updateError) throw updateError;

        // 3. Update Programs (Delete & Re-insert)
        await supabase.from('programs').delete().eq('event_id', eventId);
        
        if (programs && programs.length > 0) {
            const programsToInsert = programs.map(p => ({
                event_id: eventId,
                title: p.title,
                start_time: p.start_time,
                end_time: p.end_time,
                description: p.description,
                lat: p.lat,
                lng: p.lng
            }));
            const { error: progError } = await supabase.from('programs').insert(programsToInsert);
            if (progError) throw progError;
        }

        res.json({ message: 'Event updated successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get event stats (For Organizer)
router.get('/:id/stats', requireAuth, async (req, res) => {
    const eventId = req.params.id.replace(/[^a-zA-Z0-9-]/g, '');
    if (!eventId || eventId === 'null' || eventId === 'undefined') return res.status(400).json({ error: 'Invalid event ID format' });
    console.log(`[STATS] Fetching for Event: "${eventId}" by User: ${req.user.id}`);
    try {
        // 1. Check Ownership
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('organizer_id')
            .eq('id', eventId)
            .single();

        if (eventError || !event) {
            console.error(`[STATS ERROR] Event ${eventId} not found or error:`, eventError);
            return res.status(404).json({ error: 'Event not found' });
        }
        
        if (event.organizer_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

        // 2. Aggregate Data (Fetch all and filter in JS to be 100% sure about whitespace)
        const { data: allBookings, error: bookError } = await supabase
            .from('bookings')
            .select('amount, is_checked_in, status, event_id');

        if (bookError) throw bookError;
        
        const eventBookings = allBookings.filter(b => b.event_id?.toString().trim() === eventId);
        
        console.log(`[STATS] Found ${eventBookings.length} bookings for ${eventId} out of ${allBookings.length} total bookings.`);
        if (allBookings.length > 0) {
            console.log(`[STATS DEBUG] First booking in DB has event_id: "${allBookings[0].event_id}"`);
        }
        
        const stats = {
            total_bookings: eventBookings.length,
            total_revenue: eventBookings.reduce((sum, b) => {
                // Subtract 30 INR platform fee (3000 paise) for net revenue
                const netPaise = Math.max(0, b.amount - 3000); 
                return sum + (netPaise / 100);
            }, 0),
            checked_in_count: eventBookings.filter(b => b.is_checked_in).length
        };

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get attendees for an event (For Organizer)
router.get('/:id/attendees', requireAuth, async (req, res) => {
    const eventId = req.params.id.replace(/[^a-zA-Z0-9-]/g, '');
    if (!eventId || eventId === 'null' || eventId === 'undefined') return res.status(400).json({ error: 'Invalid event ID format' });

    try {
        // 1. Check Ownership
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('organizer_id')
            .eq('id', eventId)
            .single();

        if (eventError || !event) return res.status(404).json({ error: 'Event not found' });
        if (event.organizer_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

        // 2. Fetch Bookings and User Info
        const { data: attendees, error: bookError } = await supabase
            .from('bookings')
            .select(`
                id,
                booking_id,
                amount,
                status,
                is_checked_in,
                checked_in_at,
                is_food_redeemed,
                food_redeemed_at,
                created_at,
                user_id,
                users (
                    email,
                    role,
                    upi_id
                )
            `)
            .eq('event_id', eventId)
            .order('created_at', { ascending: false });

        if (bookError) throw bookError;

        res.json(attendees);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancel an event (For Organizer)
router.put('/:id/cancel', requireAuth, async (req, res) => {
    const eventId = req.params.id.replace(/[^a-zA-Z0-9-]/g, '');
    if (!eventId || eventId === 'null' || eventId === 'undefined') return res.status(400).json({ error: 'Invalid event ID format' });

    try {
        // 1. Check Ownership
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('organizer_id, title, is_cancelled')
            .eq('id', eventId)
            .single();

        if (eventError || !event) return res.status(404).json({ error: 'Event not found' });
        if (event.organizer_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized to cancel this event' });
        if (event.is_cancelled) return res.status(400).json({ error: 'Event is already cancelled' });

        // 2. Perform Cancellation (Set event.is_cancelled = true)
        const { error: updEventError } = await supabase
            .from('events')
            .update({ is_cancelled: true })
            .eq('id', eventId);

        if (updEventError) throw updEventError;

        // 3. Update all bookings for this event
        const { error: updBookingsError } = await supabase
            .from('bookings')
            .update({ 
                status: 'cancelled', 
                refund_status: 'pending' 
            })
            .eq('event_id', eventId);

        if (updBookingsError) throw updBookingsError;

        res.json({ message: 'Event successfully cancelled and all bookings marked for refund.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single event
router.get('/:id', async (req, res) => {
    try {
        const eventId = req.params.id.replace(/[^a-zA-Z0-9-]/g, '');
        if (!eventId || eventId === 'null' || eventId === 'undefined') return res.status(400).json({ error: 'Invalid event ID format' });
        const { data, error } = await supabase
            .from('events')
            .select('*, programs(*), reviews(*)')
            .eq('id', eventId)
            .single();
            
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(404).json({ error: 'Event not found' });
    }
});

module.exports = router;
