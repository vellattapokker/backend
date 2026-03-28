const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const requireRole = (role) => {
    return async (req, res, next) => {
        try {
            if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
            
            let { data: userData, error } = await supabase
                .from('users')
                .select('role')
                .eq('id', req.user.id)
                .single();

            if (error || !userData) {
                console.log(`User ${req.user.id} not found in public.users. Attempting auto-sync...`);
                // Fallback: Check user_metadata or default to organizer for dashboard testing
                const metadataRole = req.user.user_metadata?.role || 'organizer';
                
                const { data: syncedUser, error: syncError } = await supabase
                    .from('users')
                    .insert([{
                        id: req.user.id,
                        email: req.user.email,
                        role: metadataRole
                    }])
                    .select()
                    .single();

                if (syncError) {
                    console.error('Auto-sync failed:', syncError);
                    return res.status(403).json({ error: 'Role not found and sync failed' });
                }
                userData = syncedUser;
            }

            if (userData.role !== role && userData.role !== 'admin') {
                return res.status(403).json({ error: `Requires ${role} role (current: ${userData.role})` });
            }

            next();
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = { requireAuth, requireRole };
