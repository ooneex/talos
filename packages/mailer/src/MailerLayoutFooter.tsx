import { Facebook } from "./icons/Facebook";
import { Instagram } from "./icons/Instagram";
import { Linkedin } from "./icons/Linkedin";
import { Slack } from "./icons/Slack";
import { Tiktok } from "./icons/TikTok";

export const MailerLayoutFooter = ({
  backgroundColor,
  instagram = "https://www.instagram.com/talos_official",
  tiktok = "https://www.tiktok.com/@talos",
  linkedin = "https://www.linkedin.com/company/talos/",
  facebook = "https://www.facebook.com/profile.php?id=61560619401969",
  slack = "https://join.slack.com/t/talos/shared_invite/zt-2ragcg3dz-P0Su1E7yFG33C3L5CPOuzw",
}: {
  backgroundColor?: string;
  instagram?: string;
  tiktok?: string;
  linkedin?: string;
  facebook?: string;
  slack?: string;
}): React.JSX.Element => (
  <div
    style={{
      display: "flex",
      flexDirection: "row",
      rowGap: "24px",
      columnGap: "24px",
      gap: "24px",
      alignItems: "center",
      justifyContent: "center",
      justifyItems: "center",
      placeContent: "center",
      placeItems: "center",
      backgroundColor,
    }}
  >
    <a href={instagram}>
      <Instagram width={28} height={28} />
    </a>
    <a href={tiktok}>
      <Tiktok width={28} height={28} />
    </a>
    <a href={linkedin}>
      <Linkedin width={28} height={28} />
    </a>
    <a href={facebook}>
      <Facebook width={28} height={28} />
    </a>
    <a href={slack}>
      <Slack width={28} height={28} />
    </a>
  </div>
);
