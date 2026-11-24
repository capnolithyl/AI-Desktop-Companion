import {createRoot} from "react-dom/client";
import {NasApp} from "../../src/web/NasApp";
import "../../src/styles.css";
import "../../src/web/nas.css";
createRoot(document.getElementById("root")!).render(<NasApp/>);
