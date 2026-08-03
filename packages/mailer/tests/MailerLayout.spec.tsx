import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MailerLayout } from "@/MailerLayout";

describe("MailerLayout", () => {
  test("should expose the Header, Body and Footer slots", () => {
    expect(MailerLayout.Header).toBeFunction();
    expect(MailerLayout.Body).toBeFunction();
    expect(MailerLayout.Footer).toBeFunction();
  });

  describe("MailerLayout", () => {
    test("should render the document with the default locale, font and background", () => {
      const html = renderToStaticMarkup(<MailerLayout />);

      expect(html).toStartWith('<html lang="en"');
      expect(html).toContain("family=Montserrat:");
      expect(html).toContain("background-color:#f6f4fe");
      expect(html).toContain("font-family:Montserrat");
    });

    test("should preconnect to the google fonts hosts", () => {
      const html = renderToStaticMarkup(<MailerLayout />);

      expect(html).toContain('<link rel="preconnect" href="https://fonts.googleapis.com"/>');
      expect(html).toContain('<link rel="preconnect" href="https://fonts.gstatic.com"/>');
    });

    test("should honour the locale, font and background it is given", () => {
      const html = renderToStaticMarkup(<MailerLayout locale="fr" fontFamily="Inter" backgroundColor="#000000" />);

      expect(html).toStartWith('<html lang="fr"');
      expect(html).toContain("family=Inter:");
      expect(html).toContain("background-color:#000000");
      expect(html).toContain("font-family:Inter");
    });

    test("should render its children inside the card", () => {
      const html = renderToStaticMarkup(
        <MailerLayout>
          <p>Welcome aboard</p>
        </MailerLayout>,
      );

      expect(html).toContain("<p>Welcome aboard</p>");
    });
  });

  describe("Header", () => {
    test("should fall back to the Talos logo when it has no children", () => {
      const html = renderToStaticMarkup(<MailerLayout.Header />);

      expect(html).toContain("<svg");
      expect(html).toContain('viewBox="0 0 180 28"');
      expect(html).toContain("background-color:#432371");
    });

    test("should render its children instead of the logo", () => {
      const html = renderToStaticMarkup(
        <MailerLayout.Header>
          <span>Acme</span>
        </MailerLayout.Header>,
      );

      expect(html).toContain("<span>Acme</span>");
      expect(html).not.toContain("<svg");
    });

    test("should honour the background colour it is given", () => {
      const html = renderToStaticMarkup(<MailerLayout.Header backgroundColor="#ff0000" />);

      expect(html).toContain("background-color:#ff0000");
    });
  });

  describe("Body", () => {
    test("should render its children on a white surface", () => {
      const html = renderToStaticMarkup(
        <MailerLayout.Body>
          <p>Body copy</p>
        </MailerLayout.Body>,
      );

      expect(html).toContain("<p>Body copy</p>");
      expect(html).toContain("background-color:#ffffff");
    });

    test("should honour the background colour it is given", () => {
      const html = renderToStaticMarkup(<MailerLayout.Body backgroundColor="#eeeeee">.</MailerLayout.Body>);

      expect(html).toContain("background-color:#eeeeee");
    });
  });

  describe("Footer", () => {
    test("should link to the default social accounts", () => {
      const html = renderToStaticMarkup(<MailerLayout.Footer />);

      expect(html).toContain('href="https://www.instagram.com/talos_official"');
      expect(html).toContain('href="https://www.tiktok.com/@talosjs"');
      expect(html).toContain('href="https://www.linkedin.com/company/talos/"');
      expect(html).toContain('href="https://www.facebook.com/profile.php?id=61560619401969"');
      expect(html).toContain('href="https://join.slack.com/t/talos/shared_invite/');
    });

    test("should render one 28px icon per network", () => {
      const html = renderToStaticMarkup(<MailerLayout.Footer />);

      expect(html.match(/<svg /g)).toHaveLength(5);
      expect(html.match(/width="28" height="28"/g)).toHaveLength(5);
    });

    test("should honour the links and background it is given", () => {
      const html = renderToStaticMarkup(
        <MailerLayout.Footer
          backgroundColor="#123456"
          instagram="https://instagram.test/acme"
          tiktok="https://tiktok.test/acme"
          linkedin="https://linkedin.test/acme"
          facebook="https://facebook.test/acme"
          slack="https://slack.test/acme"
        />,
      );

      expect(html).toContain("background-color:#123456");
      expect(html).toContain('href="https://instagram.test/acme"');
      expect(html).toContain('href="https://tiktok.test/acme"');
      expect(html).toContain('href="https://linkedin.test/acme"');
      expect(html).toContain('href="https://facebook.test/acme"');
      expect(html).toContain('href="https://slack.test/acme"');
    });
  });
});
