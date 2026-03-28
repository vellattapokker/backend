require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request LOGGING for diagnostics
app.use((req, res, next) => {
    console.log(`[BACKEND REQUEST] ${req.method} ${req.url}`);
    next();
});

// Supabase Initialization
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Routes
const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { requireAuth, requireRole } = require('./middleware/auth');

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', requireAuth, requireRole('admin'), adminRoutes);

// Basic Health Check Route
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Event Mapping API is running' });
});

// Catch-all 404 for unhandled routes (Returns JSON instead of HTML)
app.use((req, res) => {
    console.log(`404 NOT FOUND: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Route not found', url: req.url, method: req.method });
});

// Export the app for Vercel Serverless Functions
module.exports = app;

// Start Server locally
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
