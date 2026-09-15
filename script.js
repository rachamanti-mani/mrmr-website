const menu=document.querySelector('.menu'),nav=document.querySelector('.navlinks');
menu?.addEventListener('click',()=>nav.classList.toggle('open'));
document.querySelectorAll('.navlinks a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.1});
document.querySelectorAll('.reveal').forEach(e=>observer.observe(e));

/*
  OPTIONAL REAL FORM BACKEND:
  Replace FORM_ENDPOINT below with your Formspree endpoint.
  Example: https://formspree.io/f/xxxxxxxx
  If left blank, the form safely falls back to opening the user's email app.
*/
const FORM_ENDPOINT='';
const form=document.getElementById('leadForm');
if(form){
 form.addEventListener('submit',async(e)=>{
   e.preventDefault();
   const status=document.getElementById('formStatus');
   const button=form.querySelector('.submit');
   const data=new FormData(form);
   if(!FORM_ENDPOINT){
     const body=`MR.MR PROJECT INQUIRY

Name: ${data.get('name')}
Email: ${data.get('email')}
Business: ${data.get('business')}
Phone/WhatsApp: ${data.get('phone')}
Service: ${data.get('service')}
Website/Social: ${data.get('link')}
Budget: ${data.get('budget')}

PROJECT DETAILS:
${data.get('message')}`;
     status.textContent='Preparing your inquiry…';
     window.location.href='mailto:rachamantimani243@gmail.com?subject='+encodeURIComponent('Mr.MR Project Inquiry — '+data.get('service'))+'&body='+encodeURIComponent(body);
     return;
   }
   button.disabled=true; button.textContent='Sending…';
   try{
     const res=await fetch(FORM_ENDPOINT,{method:'POST',body:data,headers:{Accept:'application/json'}});
     if(!res.ok) throw new Error('Submission failed');
     form.reset(); status.textContent='Thanks — your inquiry has been received. I’ll get back to you soon.';
   }catch(err){
     status.textContent='Something went wrong. Please email rachamantimani243@gmail.com directly.';
   }finally{
     button.disabled=false; button.innerHTML='Send project inquiry <span>↗</span>';
   }
 });
}
