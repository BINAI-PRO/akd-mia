/** @type {import('tailwindcss').Config} */
module.exports = {
  // En v4 no necesitas "content" si usas el plugin de postcss v4
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3f7fb",
          100:"#e8eff7",
          500:"#4b8bc5",
          600:"#2e71b3",
          700:"#235a8f"
        }
      },
      boxShadow: { card: "0 6px 18px rgba(0,0,0,0.06)" }
    }
  },
  plugins: []
};
