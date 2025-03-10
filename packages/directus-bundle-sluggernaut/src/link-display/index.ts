import { defineDisplay } from "@directus/extensions-sdk";
import DisplayComponent from "./display.vue";

export default defineDisplay({
	id: "olink_display",
	name: "Link",
	icon: "link",
	description: "Display slug or path with copy button",
	component: DisplayComponent,
	options: null,
	types: ["string"]
});
