/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './entrypoints/**/*.{html,tsx,ts}',
    './components/**/*.{tsx,ts}',
    './lib/**/*.{tsx,ts}',
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
