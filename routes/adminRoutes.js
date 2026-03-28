const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { requireRole } = require('../middleware/auth');

// Note: requireRole('admin') is applied in server.js to all these routes

// GET Global Stats
router.get('/stats', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [users, eventsCount, bookings, todayBookings, allEventsRes] = await Promise.all([
            supabase.from('users').select('id', { count: 'exact', head: true }),
            supabase.from('events').select('id', { count: 'exact', head: true }),
            supabase.from('bookings').select('amount', { count: 'exact' }),
            supabase.from('bookings').select('amount').gte('created_at', today.toISOString()),
            supabase.from('events').select('id, payout_status, ticket_price')
        ]);

        const totalRevenue = (bookings.data || []).reduce((sum, b) => sum + (b.amount || 0), 0) / 100;
        const todayRevenue = (todayBookings.data || []).reduce((sum, b) => sum + (b.amount || 0), 0) / 100;

        // Calculate accurate profit (15% + ₹30 per ticket) and organizer payouts
        const { data: eventBookings } = await supabase.from('bookings').select('event_id, amount');
        const eventPayoutMap = {};
        let totalProfit = 0;

        (eventBookings || []).forEach(b => {
            const totalPaid = (b.amount || 0) / 100; // Includes the ₹30 platform fee added on the frontend
            if (totalPaid > 0) {
                // The base ticket charge set by the organizer
                const ticketCharge = Math.max(0, totalPaid - 30);

                // Platform fee: 15% of ticket charge + ₹30 flat fee
                let profit = (ticketCharge * 0.15) + 30;
                
                // Organizer gets: exactly 85% of the ticket charge
                let payout = ticketCharge * 0.85;

                totalProfit += profit;
                eventPayoutMap[b.event_id] = (eventPayoutMap[b.event_id] || 0) + payout;
            }
        });

        const unsettledEvents = (allEventsRes.data || []).filter(e => e.payout_status !== 'settled');
        
        let pendingPayouts = unsettledEvents.reduce((sum, e) => sum + (eventPayoutMap[e.id] || 0), 0);

        console.log(`[ADMIN STATS] Unsettled events: ${unsettledEvents.length}, Pending Organizer Payout: ₹${pendingPayouts}, Platform Profit: ₹${totalProfit}`);

        res.json({
            total_users: users.count || 0,
            total_events: eventsCount.count || 0,
            total_bookings: bookings.count || 0,
            total_revenue: totalRevenue,
            today_revenue: todayRevenue,
            total_profit: totalProfit,
            pending_payouts: pendingPayouts,
            unsettled_events: unsettledEvents.length,
            system_status: 'operational',
            last_updated: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET Recent Activity Log
router.get('/activity', async (req, res) => {
    try {
        const [recentBookings, recentUsers] = await Promise.all([
            supabase.from('bookings').select(`
                id, amount, created_at, user_id,
                events:events!event_id (title)
            `).order('created_at', { ascending: false }).limit(10),
            supabase.from('users').select('id, email, created_at').order('created_at', { ascending: false }).limit(10)
        ]);

        const activity = [
            ...(recentBookings.data || []).map(b => ({ 
                type: 'booking', 
                ...b,
                event_title: b.events?.title || 'Unknown Event'
            })),
            ...(recentUsers.data || []).map(u => ({ type: 'signup', ...u }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 15);

        res.json(activity);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET All Users
router.get('/users', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PATCH Update User Role
router.patch('/users/:id/role', async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!['user', 'organizer', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const { data, error } = await supabase
            .from('users')
            .update({ role })
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json({ message: `User role updated to ${role}`, user: data[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET All Events (Global) with Sales Stats
router.get('/events', async (req, res) => {
    try {
        const [eventsResponse, bookingsResponse] = await Promise.all([
            supabase.from('events').select(`
                *,
                organizer:users!organizer_id (email)
            `).order('created_at', { ascending: false }),
            supabase.from('bookings').select('event_id, amount')
        ]);

        if (eventsResponse.error) throw eventsResponse.error;

        const events = eventsResponse.data;
        const bookings = bookingsResponse.data || [];

        // Aggregate bookings by event_id
        const statsMap = bookings.reduce((acc, b) => {
            if (!acc[b.event_id]) acc[b.event_id] = { sold: 0, revenue: 0 };
            acc[b.event_id].sold += 1;
            acc[b.event_id].revenue += (b.amount || 0) / 100;
            return acc;
        }, {});

        const enrichedEvents = events.map(event => ({
            ...event,
            tickets_sold: statsMap[event.id]?.sold || 0,
            revenue: statsMap[event.id]?.revenue || 0,
            organizer_email: event.organizer?.email || 'Unknown'
        }));

        res.json(enrichedEvents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST Mark Event as Paid Out (Settlement)
router.post('/events/:id/payout', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('events')
            .update({ payout_status: 'settled', settled_at: new Date().toISOString() })
            .eq('id', id)
            .select();

        if (error) throw error;
        res.json({ message: 'Payout recorded successfully', event: data[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE Event (Global Moderation)
router.delete('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Event deleted by administrator' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
