import "@danfessler/trellis-element";
import "@danfessler/trellis/style.css";

const el = document.querySelector("trellis-workspace")!;
el.addEventListener("trellis-ready", () => {
  document.getElementById("reopen")!.addEventListener("click", () =>
    el.workspace!.open("readme", { params: { name: "index.html" } }),
  );
});
