import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Terms of Service — ${LEGAL.product}`,
  description: `Terms for using ${LEGAL.product}, an internal tool operated by ${LEGAL.company}.`,
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated {LEGAL.lastUpdated}</p>

      <p>
        These terms cover the use of {LEGAL.product} (the “Service”), an
        internal tool operated by {LEGAL.company} (“we”, “us”) for preparing and
        sharing client presentations. By using the Service you agree to them.
      </p>

      <h2>Who may use the Service</h2>
      <p>
        The Service is not open to the public. Accounts are created by
        invitation for {LEGAL.company} staff and authorised collaborators. You
        must be at least 18 years old and using the Service for business
        purposes.
      </p>
      <p>
        You are responsible for what happens under your account, including
        keeping your sign-in credentials to yourself. Tell us promptly if you
        think someone else has access to your account.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Share your account or give access to anyone not authorised to have it.</li>
        <li>
          Upload content you do not have the rights to use, including images,
          audio, fonts, or copy belonging to someone else.
        </li>
        <li>
          Upload anything unlawful, or anything that infringes another person’s
          rights.
        </li>
        <li>
          Attempt to break, overload, reverse engineer, or gain unauthorised
          access to any part of the Service.
        </li>
        <li>
          Use the Service to store sensitive personal information — health
          records, government identification numbers, payment card numbers, or
          similar. It is not built for that.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        You keep ownership of the presentations, images, audio, and other
        material you put into the Service. You give us permission to store,
        process, and display that material only as needed to operate the Service
        for you — for example, to render a presentation or serve a published
        link.
      </p>
      <p>
        You are responsible for making sure you have the rights to any material
        you upload, and for the accuracy of anything you publish.
      </p>

      <h2>Published presentations</h2>
      <p>
        Publishing makes a presentation viewable at an unlisted web address by
        anyone who has the link. Links are not indexed by search engines, but
        they are not secret. Do not publish anything you would not be willing to
        have forwarded. You can un-publish at any time, which takes the link
        down immediately.
      </p>

      <h2>Our content</h2>
      <p>
        The Service itself — its software, design, and branding — belongs to{" "}
        {LEGAL.company}. These terms do not give you any rights to it beyond
        using the Service as intended.
      </p>

      <h2>Availability</h2>
      <p>
        We aim to keep the Service running but do not promise it will be
        uninterrupted or error-free. We may change, suspend, or discontinue any
        part of it, and we may perform maintenance that makes it briefly
        unavailable. We will give notice of significant changes where we
        reasonably can.
      </p>

      <h2>Ending access</h2>
      <p>
        We may suspend or close an account that breaches these terms, or when
        someone is no longer authorised to have access. You can ask us to close
        your account at any time. Content may be deleted after an account is
        closed, so export anything you want to keep first.
      </p>

      <h2>Disclaimer and liability</h2>
      <p>
        The Service is provided “as is”, without warranties of any kind to the
        fullest extent the law allows. To the fullest extent permitted by law,{" "}
        {LEGAL.company} is not liable for indirect, incidental, or consequential
        damages, or for lost profits or lost data, arising from use of the
        Service.
      </p>

      <h2>Privacy</h2>
      <p>
        Our <a href="/legal/privacy">Privacy Policy</a> explains what
        information the Service handles and why. It forms part of these terms.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. When we do, we will change the date at the
        top of this page. Continuing to use the Service after a change means you
        accept the updated terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of {LEGAL.governingLaw}, without
        regard to its conflict of law rules.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms can go to{" "}
        <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
        {LEGAL.postalAddress ? `, or by post to ${LEGAL.postalAddress}.` : "."}
      </p>
    </>
  );
}
