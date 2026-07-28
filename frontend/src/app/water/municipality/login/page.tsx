import { redirect } from "next/navigation";

export default function MunicipalityLoginRedirect() {
  redirect("/water/login?role=municipality");
}
