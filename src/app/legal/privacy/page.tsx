import type { Metadata } from "next";
import { LEGAL, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy — ${LEGAL.product}`,
  description: `How ${LEGAL.company} handles information in ${LEGAL.product}.`,
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated {LEGAL.lastUpdated}</p>

      <p>
        {LEGAL.product} is an internal tool built and operated by {LEGAL.company}
        {" "}for preparing and sharing client presentations. This policy explains what
        information the tool handles, why, and who it is shared with.
      </p>
      <p>
        The tool is not offered to the general public and is not sold. Accounts
        are created by invitation for {LEGAL.company} staff only.
      </p>

      <h2>Who this policy covers</h2>
      <p>There are two groups of people whose information appears in the tool:</p>
      <ul>
        <li>
          <strong>Team members</strong> who sign in to create presentations.
        </li>
        <li>
          <strong>Client and prospect contacts</strong> whose business details
          are recorded so presentations can be addressed and personalised.
        </li>
      </ul>
      <p>
        People who simply view a published presentation do not need an account,
        and we do not require any information from them to view it.
      </p>

      <h2>Information we collect</h2>

      <h3>Account information</h3>
      <p>
        When a team member signs in, we receive their name, email address, and
        profile picture, along with the timestamps of their sign-ins. This is
        used to sign them in, to attribute the work they do in the tool, and to
        contact them about the tool itself.
      </p>

      <h3>Signing in with Google</h3>
      <p>
        Team members may sign in using a Google account. If they do, Google
        shares their name, email address, profile picture, and Google account
        identifier with us.
      </p>
      <p>
        We use that information <strong>only</strong> to create and authenticate
        their account. We do not use Google user data for advertising, we do not
        sell or transfer it, and we do not use it to build profiles or to train
        machine learning models. We do not request access to Gmail, Drive,
        Calendar, Contacts, or any other Google service.
      </p>

      <h3>Business contact information</h3>
      <p>
        Team members record details about client and prospect companies —
        company name, website, industry, and the names, job titles, email
        addresses, and phone numbers of business contacts. This is ordinary
        business contact information, used to prepare and address presentations.
      </p>

      <h3>Content</h3>
      <p>
        Presentation content — text, images, audio narration, captions, and
        internal comments — is stored so it can be edited and shared.
      </p>

      <h3>What we do not do</h3>
      <ul>
        <li>We do not use advertising or third-party tracking cookies.</li>
        <li>We do not sell or rent information to anyone.</li>
        <li>
          We do not run analytics on people who view published presentations.
        </li>
        <li>
          We do not knowingly collect information from anyone under 18. The tool
          is for business use only.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use cookies that are necessary for the tool to work: a session cookie
        that keeps a signed-in team member signed in, and browser storage that
        remembers their interface preferences, such as which view they last used.
        There are no advertising or tracking cookies.
      </p>

      <h2>Published presentations</h2>
      <p>
        A presentation becomes viewable at a public web address only when
        someone at {LEGAL.company} explicitly approves and publishes it. Those
        addresses are unlisted and marked so that search engines do not index
        them, but anyone with the link can open it, so treat a published link as
        shareable. Un-publishing takes the link down immediately.
      </p>

      <h2>Who we share information with</h2>
      <p>
        We share information only with the service providers that run the tool
        on our behalf. Each is bound by its own agreement to handle it
        appropriately.
      </p>
      <table className="legal-table">
        <thead>
          <tr><th scope="col">Provider</th><th scope="col">What it does</th></tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((entry) => (
            <tr key={entry.name}>
              <th scope="row">{entry.name}</th>
              <td>{entry.purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        We may also disclose information if we are legally required to, or to
        protect our rights or the safety of others.
      </p>

      <h2>Where information is stored</h2>
      <p>
        Information is stored on servers operated by the providers listed above,
        which may be located in the United States or elsewhere. If you are
        outside the United States, your information may be transferred to and
        processed there.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Presentation content and company records are kept for as long as they
        are useful to the business, and deleted on request. Account information
        is deleted when an account is closed.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us to see, correct, or delete information we hold about you,
        or to stop using it. Team members can also disconnect a Google account
        at any time from their Google account settings, and can close their
        account by contacting us. Depending on where you live you may have
        additional rights under laws such as the GDPR or the CCPA; we will
        honour those requests regardless of where you are.
      </p>
      <p>
        To make a request, email{" "}
        <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
      </p>

      <h2>Security</h2>
      <p>
        Access to the tool requires an invitation and a sign-in. Traffic is
        encrypted in transit. No system is perfectly secure, but we take
        reasonable steps to protect what we hold and to limit who can reach it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy we will update the date at the top of this page.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy can go to{" "}
        <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
        {LEGAL.postalAddress ? `, or by post to ${LEGAL.postalAddress}.` : "."}
      </p>
    </>
  );
}
