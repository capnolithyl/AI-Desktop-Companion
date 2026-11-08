import { createRoot } from "react-dom/client";

const root = createRoot(document.getElementById("root")!);
if (import.meta.env.MODE === "mobile") {
  void import("./mobile/MobileApp").then(({ default: MobileApp }) => root.render(<MobileApp/>));
} else {
  void Promise.all([import("./App"), import("./styles.css")]).then(([{ default: App }]) => root.render(<App/>));
}
