export const MAILER_BODY_STYLE = {
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
} as const;

export const MailerLayoutBody = ({
  children,
  backgroundColor = "#ffffff",
}: {
  children: React.ReactNode;
  backgroundColor?: string;
}): React.JSX.Element => (
  <div
    style={{
      ...MAILER_BODY_STYLE,
      backgroundColor,
    }}
  >
    {children}
  </div>
);
