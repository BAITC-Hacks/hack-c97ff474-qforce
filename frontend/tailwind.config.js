export default {
  content: ["./app/**/*.{vue,js,ts}"],
  theme: {
    extend: {
      colors: {
        primary: "#087F6B",
        deep: "#074E43",
        gold: "#EDBD57",
        mint: "#EAF6F0",
        ink: "#19372F",
        muted: "#697A74",
        canvas: "#F5F7F4",
      },
      borderRadius: { panel: "20px" },
    },
  },
  corePlugins: { preflight: false },
};
