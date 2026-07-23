const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(cors());

// Supabase Credentials (Render environment variables se aayenge)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. Key Verification API (Android / Client App Ke Liye)
app.post('/api/verify', async (req, res) => {
  const { key, deviceId } = req.body;

  if (!key || !deviceId) {
    return res.json({ success: false, message: 'Key aur Device ID required hain!' });
  }

  // Database me key search karo
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

  // CASE 1: Unused Key (Pehli baar login)
  if (keyData.status === 'unused') {
    const now = new Date();
    const expiry = new Date();
    expiry.setDate(now.getDate() + keyData.duration_days);

    const { error: updateErr } = await supabase
      .from('keys')
      .update({
        status: 'active',
        device_id: deviceId, // Phone Lock Save Ho Gaya
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

  // CASE 2: Already Active Key
  if (keyData.status === 'active') {
    // Expiry Check
    if (new Date(keyData.expires_at) < new Date()) {
      await supabase.from('keys').update({ status: 'expired' }).eq('id', keyData.id);
      return res.json({ success: false, message: 'Key Expire Ho Chuki Hai!' });
    }

    // Single Phone Check
    if (keyData.device_id === deviceId) {
      return res.json({ 
        success: true, 
        message: 'Welcome Back!',
        expires_at: keyData.expires_at
      });
    } else {
      return res.json({ 
        success: false, 
        message: '❌ Device Mismatch: Ye key kisi aur phone me locked hai!' 
      });
    }
  }

  return res.json({ success: false, message: 'Key Expired or Invalid!' });
});

// 2. Generate Keys API
app.post('/api/generate-key', async (req, res) => {
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Project Alpha API Server Running on port ${PORT}`));
