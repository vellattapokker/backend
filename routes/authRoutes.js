const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

router.post('/signup', async (req, res) => {
    const { email, password, role } = req.body;
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { role: role || 'user' }
            }
        });
        
        if (error) throw error;
        
        if (data.user) {
            // Note: In production, it's better to use a Supabase database trigger
            // to automatically insert the user into the public.users table upon auth.users creation.
            await supabase.from('users').insert([{
                id: data.user.id,
                email,
                role: role || 'user'
            }]);
        }

        res.json({ message: 'Signup successful', data });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        res.json({ message: 'Login successful', session: data.session });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/me', requireAuth, async (req, res) => {
    const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', req.user.id)
        .single();
    
    res.json({ user: req.user, profile: userData });
});

module.exports = router;
