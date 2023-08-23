/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "*.html",
    "./src/**/*.{html,tsx,ts,js}"
  ],
  theme: {
    extend: {
      zIndex: {
        1000: "1000",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
