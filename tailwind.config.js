/** @type {import('tailwindcss').Config} */
module.exports = {
  // En v4 no necesitas "content" si usas el plugin de postcss v4
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f7f8",
          100: "#dfeaf0",
          200: "#c5d9e4",
          300: "#aac7d7",
          400: "#95bacf",
          500: "#8cb7c7",
          600: "#6f90b9",
          700: "#4f6a8c",
          800: "#364c66",
          900: "#243349"
        },
        indigo: {
          50: "#eef1f7",
          100: "#dce3f0",
          200: "#bac3de",
          300: "#99a4ce",
          400: "#7f8cc3",
          500: "#6f80b9",
          600: "#55639a",
          700: "#404a74",
          800: "#2b3350",
          900: "#1e2336"
        },
        emerald: {
          50: "#edf5f7",
          100: "#d5e7ed",
          200: "#bdd7e1",
          300: "#a3c6d3",
          400: "#8cb7c7",
          500: "#76a6b6",
          600: "#5a8898",
          700: "#446674",
          800: "#2f4853",
          900: "#203238"
        },
        amber: {
          50: "#fff7f1",
          100: "#fdebdc",
          200: "#fde0c7",
          300: "#f9cfb0",
          400: "#f3b793",
          500: "#e99e73",
          600: "#d07f53",
          700: "#a9623d",
          800: "#80472d",
          900: "#5d3221"
        },
        rose: {
          50: "#fdf4f5",
          100: "#f8e6ea",
          200: "#f3d6dd",
          300: "#edc4ce",
          400: "#e3aab7",
          500: "#d68b9c",
          600: "#b96a7d",
          700: "#904d5d",
          800: "#683640",
          900: "#46232a"
        },
        slate: {
          50: "#f6f6f6",
          100: "#ededed",
          200: "#dcdcdc",
          300: "#c6c6c6",
          400: "#b1b1b0",
          500: "#9d9d9c",
          600: "#7f7f7e",
          700: "#5f5f5e",
          800: "#424241",
          900: "#2c2c2b"
        }
      },
      boxShadow: { card: "0 6px 18px rgba(0,0,0,0.06)" }
    }
  },
  plugins: []
};
