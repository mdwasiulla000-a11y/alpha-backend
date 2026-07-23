const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// 🚨 UNIVERSAL CORS FIX (Preflight requests ke liye mandatory hai)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(cors());
app.use(express.json());

// Supabase Initialization
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Root Route
app.get('/', (req, res) => {
  res.status(200).send('Alpha Backend is Live!');
});

// Key Verification Endpoint
app.post('/api/verify', async (req, res) => {
  try {
    const { key, deviceId } = req.body;

    if (!key || !deviceId) {
      return res.json({ success: false, message: 'Key aur Device ID required hain!' });
    }

    const { data: keyData, error } = await supabase
      .from('keys')
      .select('*')
      .eq('key_code', key)
      .single();

    if (error || !keyData) {
      return res.json({ success: false, message: 'Invalid License Key!' });
    }

    if (keyData.status === 'banned') {
      return res.json({ success: false, message: 'Ye Key Banned hai!' });
    }

    if (keyData.status === 'unused') {
      const now = new Date();
      const expiry = new Date();
      expiry.setDate(now.getDate() + keyData.duration_days);

      const { error: updateErr } = await supabase
        .from('keys')
        .update({
          status: 'active',
          device_id: deviceId,
          activated_at: now.toISOString(),
          expires_at: expiry.toISOString()
        })
        .eq('id', keyData.id);

      if (updateErr) return res.json({ success: false, message: 'Activation Error!' });

      return res.json({ 
        success: true, 
        message: 'Key Activated Successfully!',
        expires_at: expiry.toISOString()
      });
    }

    if (keyData.status === 'active') {
      if (new Date(keyData.expires_at) < new Date()) {
        await supabase.from('keys').update({ status: 'expired' }).eq('id', keyData.id);
        return res.json({ success: false, message: 'Key Expire Ho Chuki Hai!' });
      }

      if (keyData.device_id === deviceId) {
        return res.json({ 
          success: true, 
          message: 'Welcome Back!',
          expires_at: keyData.expires_at
        });
      } else {
        return res.json({ 
          success: false, 
          message: 'Device Mismatch! Ye key kisi aur device me locked hai.' 
        });
      }
    }

    return res.json({ success: false, message: 'Key Expired or Invalid!' });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Key Generation Endpoint
app.post('/api/generate-key', async (req, res) => {
  try {
    const { userId, durationDays, amount } = req.body;

    const generatedKeys = [];
    for (let i = 0; i < (amount || 1); i++) {
      const randomCode = 'ALPHA-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      generatedKeys.push({
        key_code: randomCode,
        created_by: userId || null,
        duration_days: durationDays || 30,
        status: 'unused'
      });
    }

    const { data, error } = await supabase.from('keys').insert(generatedKeys).select();

    if (error) return res.json({ success: false, message: error.message });

    return res.json({ success: true, keys: data });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Project Alpha API Server Running on port ${PORT}`));
