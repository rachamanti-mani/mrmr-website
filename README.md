# Mr.MR Website V4

Files:
- index.html — main landing page
- about.html — detailed about/experience page
- services.html — services + process
- projects.html — project showcase
- start-a-project.html — client/business inquiry form
- styles.css — shared styling
- script.js — navigation, animations and inquiry handling

## Inquiry form
The form currently has a safe email fallback.
For real stored submissions, create a Formspree form and paste its endpoint into:
const FORM_ENDPOINT='...';
in script.js.

Then commit and push the files to the connected GitHub repository. Vercel will deploy the update.
