# Sending the Air Force report from the app

Export Reported Data builds the Air Force Route Survey PDF in the browser and downloads it so the crew can email the file to the customer. A Send action can deliver that same PDF from the app. The mail token never belongs in the web page.

This is a design note for a later CAP-hosted site. The app does not send mail today.

## What has to be true

1. The browser still builds the PDF, including the no-new-towers report.
2. The crew enters the customer's email address. The email already on the report is the crew point of contact, not the customer.
3. The browser posts the PDF, the filename, and the customer address to a server route on the site that hosts the app.
4. That server calls a mail service, attaches the PDF, and sets Reply-To to the point-of-contact address so the customer can answer the crew.
5. Download stays on the page. A long report with photos can exceed a mail service's attachment limit, and the crew still needs a file they can send themselves.

The server route is the piece Railway would have hosted. Any CAP website can do the same job if it can run that short server step. A site made only of static files cannot send the message, because the mail token would be visible in the browser.

## Mailtrap

Use Mailtrap Email Sending. Mailtrap's testing inbox only captures messages for inspection. Those messages never arrive at the Air Force.

CAP IT has to:

1. Create a Mailtrap Email Sending token and store it on the server, not in the web app.
2. Send from an address on a domain CAP controls.
3. Add the SPF and DKIM DNS records Mailtrap provides for that domain.

## If CAP already sends mail

The Export page can stay the same. The server route hands the PDF to CAP's own mail system instead of Mailtrap. The crew still sees Send next to Download.
