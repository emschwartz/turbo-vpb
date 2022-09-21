/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,tsx,ts,js}"],
  theme: {
    extend: {
      zIndex: {
        1000: "1000",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
