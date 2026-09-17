const menu = document.querySelector('.menu');
const nav = document.querySelector('.navlinks');

menu?.addEventListener('click', () => nav?.classList.toggle('open'));
document.querySelectorAll('.navlinks a').forEach((a) =>
  a.addEventListener('click', () => nav?.classList.remove('open'))
);

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      }),
    { threshold: 0.1 }
  );

  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
}

/*
  Mr.MR V5.1
  Real project inquiry storage using Supabase.

  The browser uses ONLY the Supabase publishable key.
  Do not place a secret/service-role key in this file.

  If Supabase is not configured yet, the form keeps the V4 email fallback
  so the live website does not lose inquiries during setup.
*/

const form = document.getElementById('leadForm');

function getSupabaseClient() {
  const config = window.MR_SUPABASE_CONFIG;

  if (
    !config ||
    !config.url ||
    !config.publishableKey ||
    config.url.includes('PASTE_YOUR_') ||
    config.publishableKey.includes('PASTE_YOUR_')
  ) {
    return null;
  }

  if (!window.supabase?.createClient) {
    return null;
  }

  return window.supabase.createClient(config.url, config.publishableKey);
}

function buildInquiryEmail(data) {
  return `MR.MR PROJECT INQUIRY

Name: ${data.get('name')}
Email: ${data.get('email')}
Business: ${data.get('business')}
Phone/WhatsApp: ${data.get('phone')}
Service: ${data.get('service')}
Website/Social: ${data.get('link')}
Budget: ${data.get('budget')}

PROJECT DETAILS:
${data.get('message')}`;
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const status = document.getElementById('formStatus');
    const button = form.querySelector('.submit');
    const data = new FormData(form);

    status.className = 'status';
    status.textContent = 'Sending your inquiry…';
    button.disabled = true;
    button.textContent = 'Sending…';

    const supabaseClient = getSupabaseClient();

    // V4-safe fallback while Supabase configuration is being completed.
    if (!supabaseClient) {
      const body = buildInquiryEmail(data);

      status.textContent = 'Preparing your inquiry…';
      window.location.href =
        'mailto:rachamantimani243@gmail.com?subject=' +
        encodeURIComponent('Mr.MR Project Inquiry — ' + data.get('service')) +
        '&body=' +
        encodeURIComponent(body);

      button.disabled = false;
      button.innerHTML = 'Send project inquiry <span>↗</span>';
      return;
    }

    const inquiry = {
      name: String(data.get('name') || '').trim(),
      email: String(data.get('email') || '').trim(),
      business: String(data.get('business') || '').trim() || null,
      phone: String(data.get('phone') || '').trim() || null,
      service: String(data.get('service') || '').trim(),
      website: String(data.get('link') || '').trim() || null,
      budget: String(data.get('budget') || '').trim() || null,
      project_details: String(data.get('message') || '').trim(),
      status: 'NEW'
    };

    try {
      const { error } = await supabaseClient
        .from('project_inquiries')
        .insert([inquiry]);

      if (error) {
        throw error;
      }

      form.reset();
      status.className = 'status success';
      status.textContent =
        'Thanks — your inquiry has been received. I’ll review it and get back to you soon.';
    } catch (error) {
      console.error('Mr.MR inquiry submission error:', error);
      status.className = 'status error';
      status.textContent =
        'We could not save your inquiry right now. Please email rachamantimani243@gmail.com directly.';
    } finally {
      button.disabled = false;
      button.innerHTML = 'Send project inquiry <span>↗</span>';
    }
  });
}
