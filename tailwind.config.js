/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1915",
        paper: "#f3efe6",
        card: "#fffdf8",
        line: "#e3d9c8",
        forest: "#1b2e26",
        moss: "#234237",
        copper: "#b5521a",
        "copper-dark": "#8d3e12",
        pine: "#1f6b4a",
      },
      fontFamily: {
        sans: ['"Avenir Next"', "Nunito Sans", "Segoe UI", "sans-serif"],
        serif: ['"Iowan Old Style"', "Palatino", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(28, 25, 21, 0.05), 0 8px 24px rgba(28, 25, 21, 0.04)",
      },
    },
  },
  plugins: [],
};
