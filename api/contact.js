// /api/contact.js — Lead capture form handler for 305 Luxury Rentals
// Sends email via Resend REST API. No npm dependencies (uses Node 20+ built-in fetch).
// CommonJS module — matches the pattern used in api/chat.js

// TODO: Add rate limiting (e.g. upstash/ratelimit or a simple in-memory map)
// before high-traffic launch to prevent abuse.

const RESEND_API_URL = 'https://api.resend.com/emails';

const REQUIRED_FIELDS = [
  'name',
  'email',
  'phone',
  'preferredDate',
  'guestCount',
  'eventType',
  'experienceInterest',
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtmlBody(data) {
  var rows = [
    ['Name', data.name],
    ['Email', data.email],
    ['Phone', data.phone],
    ['Preferred Date', data.preferredDate],
    ['Guest Count', data.guestCount],
    ['Event Type', data.eventType],
    ['Experience Interest', data.experienceInterest],
    ['Specific Selection', data.specificSelection || '—'],
    ['Message', data.message || '—'],
  ];

  var tableRows = rows
    .map(function (row) {
      return (
        '<tr>' +
        '<td style="padding:8px 16px 8px 0;font-weight:600;color:#C9A84C;white-space:nowrap;vertical-align:top;">' +
        escapeHtml(row[0]) +
        '</td>' +
        '<td style="padding:8px 0;color:#e8edf3;">' +
        escapeHtml(row[1]) +
        '</td>' +
        '</tr>'
      );
    })
    .join('');

  return (
    '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#060d1a;font-family:system-ui,-apple-system,sans-serif;">' +
    '<div style="max-width:600px;margin:0 auto;padding:40px 24px;">' +
    '<div style="border-top:3px solid #C9A84C;padding-top:24px;margin-bottom:32px;">' +
    '<h1 style="font-size:22px;color:#ffffff;margin:0 0 4px;">New Booking Inquiry</h1>' +
    '<p style="font-size:12px;color:#7a8fa8;margin:0;letter-spacing:0.1em;text-transform:uppercase;">305 Luxury Rentals</p>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    tableRows +
    '</table>' +
    '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:32px 0;">' +
    '<p style="font-size:11px;color:#7a8fa8;margin:0;">Reply directly to this email to respond to the customer.</p>' +
    '</div>' +
    '</body></html>'
  );
}

function buildTextBody(data) {
  return [
    '305 Luxury Rentals — New Booking Inquiry',
    '==========================================',
    'Name:                 ' + data.name,
    'Email:                ' + data.email,
    'Phone:                ' + data.phone,
    'Preferred Date:       ' + data.preferredDate,
    'Guest Count:          ' + data.guestCount,
    'Event Type:           ' + data.eventType,
    'Experience Interest:  ' + data.experienceInterest,
    'Specific Selection:   ' + (data.specificSelection || '—'),
    'Message:              ' + (data.message || '—'),
    '',
    'Reply to this email to contact the customer.',
  ].join('\n');
}

module.exports = async function handler(req, res) {
  // Method guard
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Honeypot — bots fill hidden fields, humans leave them blank
  if (body._hp && String(body._hp).trim() !== '') {
    // Silently succeed — do not process the submission
    return res.status(200).json({ ok: true });
  }

  // Required field validation
  var missing = REQUIRED_FIELDS.filter(function (field) {
    return !body[field] || String(body[field]).trim() === '';
  });
  if (missing.length > 0) {
    return res.status(400).json({
      error: 'Missing required fields: ' + missing.join(', '),
    });
  }

  // API key check — after validation so users get field errors first
  if (!process.env.RESEND_API_KEY) {
    console.error('[contact] RESEND_API_KEY is not set');
    return res.status(500).json({
      error: 'Email service not configured. Please contact (305) 876-6650.',
    });
  }

  var data = {
    name: String(body.name).trim(),
    email: String(body.email).trim(),
    phone: String(body.phone).trim(),
    preferredDate: String(body.preferredDate).trim(),
    guestCount: String(body.guestCount).trim(),
    eventType: String(body.eventType).trim(),
    experienceInterest: String(body.experienceInterest).trim(),
    specificSelection: body.specificSelection ? String(body.specificSelection).trim() : '',
    message: body.message ? String(body.message).trim() : '',
  };

  var fromEmail =
    process.env.CONTACT_FROM_EMAIL ||
    '305 Luxury Rentals <bookings@305luxuryrentals.com>';
  var toEmail =
    process.env.CONTACT_TO_EMAIL || 'info@305luxuryrentals.com';

  var subject =
    'New booking inquiry \u2014 ' + data.eventType + ' \u2014 ' + data.name;

  var emailPayload = {
    from: fromEmail,
    to: [toEmail],
    reply_to: data.email,
    subject: subject,
    html: buildHtmlBody(data),
    text: buildTextBody(data),
  };

  try {
    var response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      },
      body: JSON.stringify(emailPayload),
    });

    if (!response.ok) {
      var errorText = await response.text();
      console.error('[contact] Resend API error ' + response.status + ':', errorText.slice(0, 500));
      return res.status(502).json({
        error: 'Failed to send email. Please contact (305) 876-6650.',
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[contact] Network error sending email:', err);
    return res.status(502).json({
      error: 'Could not reach email service. Please contact (305) 876-6650.',
    });
  }
};
