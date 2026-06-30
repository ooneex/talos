import type { LocaleType } from "@talosjs/translation";
import { MailerLayoutBody } from "./MailerLayoutBody";
import { MailerLayoutFooter } from "./MailerLayoutFooter";
import { MailerLayoutHeader } from "./MailerLayoutHeader";

type PropsType = {
  locale?: LocaleType;
  fontFamily?: string;
  backgroundColor?: string;
  children?: React.ReactNode;
};

type MailerLayoutComponentType = React.FC<PropsType> & {
  Header: typeof MailerLayoutHeader;
  Body: typeof MailerLayoutBody;
  Footer: typeof MailerLayoutFooter;
};

const MailerLayoutComponent = ({
  locale = "en",
  fontFamily = "Montserrat",
  backgroundColor = "#f6f4fe",
  children,
}: PropsType): React.JSX.Element => (
  <html
    lang={locale}
    style={{
      width: "100%",
      padding: "0px",
      margin: "0px",
      boxSizing: "border-box",
    }}
  >
    <head>
      <link
        href={`https://fonts.googleapis.com/css?family=${fontFamily}:thin,extra-light,light,100,200,300,400,500,600,700,800`}
        rel="stylesheet"
      />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" />
    </head>
    <body
      style={{
        backgroundColor,
        width: "100%",
        minHeight: "100vh",
        fontFamily,
        display: "flex",
        flexDirection: "column",
        columnGap: "32px",
        padding: "0px",
        margin: "0px",
        boxSizing: "border-box",
        overflow: "scroll",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          width: "100%",
          maxWidth: "640px",
          padding: "32px",
          margin: "auto",
          borderRadius: "4px",
          display: "flex",
          flexDirection: "column",
          columnGap: "26px",
          marginTop: "60px",
          marginBottom: "32px",
          color: "#432371",
          lineHeight: "1.5",
          fontSize: "16px",
        }}
      >
        {children}
      </div>
    </body>
  </html>
);

MailerLayoutComponent.Header = MailerLayoutHeader;
MailerLayoutComponent.Body = MailerLayoutBody;
MailerLayoutComponent.Footer = MailerLayoutFooter;

export const MailerLayout: MailerLayoutComponentType = MailerLayoutComponent;
