require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const app = express();
app.use(cors());
app.use(bodyParser.json());
let client = null;
if(process.env.TWILIO_SID && process.env.TWILIO_TOKEN){
  try{ 
    client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN); 
    console.log('Twilio client configured');
   }
   catch(e){ 
    console.error('Twilio init error', e.message);
   }
} 
else { 
  console.warn('⚠️ Twilio credentials missing in .env (SMS & Calls disabled)'); 
}
app.get('/', (req,res)=> res.json({status:'ok', twilioConfigured: !!client}));
app.post('/send-sms', async (req,res)=>{
  if(!client) return res.status(500).json({error:'twilio not configured'});
  const { contacts, userEmail, location } = req.body;
  if(!contacts || !contacts.length) return res.status(400).json({error:'no contacts'});
  try{
    const results = [];
    for(const c of contacts){
      if(!c.phone) continue;
      const body = `EMERGENCY ALERT: ${userEmail} needs help. Location: ${location.mapsUrl}`;
      const msg = await client.messages.create({ body, from: process.env.TWILIO_FROM, to: c.phone });
      results.push({ to: c.phone, sid: msg.sid });
    }
    res.json({ok:true, results});
  }
  catch(err){ console.error('sms err', err); 
    res.status(500).json({ok:false, error:err.message});
   }
});
app.post('/make-call', async (req,res)=>{
  if(!client) return res.status(500).json({error:'twilio not configured'});
  const { contacts, userEmail, location } = req.body;
  if(!contacts || !contacts.length) return res.status(400).json({error:'no contacts'});
  try{
    const results = [];
    for(const c of contacts){
      if(!c.phone) continue;
      const call = await client.calls.create({ twiml: `<Response><Say>Emergency alert: ${userEmail} needs help. Location: ${location.mapsUrl}</Say></Response>`, from: process.env.TWILIO_FROM, to: c.phone });
      results.push({ to: c.phone, sid: call.sid });
    }
    res.json({ok:true, results});
  }catch(err){ console.error('call err', err); 
    res.status(500).json({ok:false, error:err.message}); }
});
const PORT = process.env.PORT || 3000; 
app.listen(PORT, ()=> console.log('🚀 Backend server running on port', PORT));