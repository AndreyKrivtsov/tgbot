import antfu from "@antfu/eslint-config"
import drizzle from "eslint-plugin-drizzle"

export default antfu(
  {
    stylistic: {
      indent: 2,
      quotes: "double",
    },
  },
  {
    files: ["**/*.js", "**/*.ts"],
    rules: {
      "node/prefer-global/process": "off",
      "no-console": "off",
      "antfu/no-top-level-await": "off",
      "style/brace-style": "off",
      "perfectionist/sort-imports": "unsorted",
    },
    plugins: {
      drizzle,
    },

  },
)
