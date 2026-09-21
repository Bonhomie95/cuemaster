import { registerRootComponent } from "expo";
try {
  const App = require("./App").default;
  registerRootComponent(App);
} catch (error) {
  console.log(
    "BOOTSTRAP_STACK_JSON",
    JSON.stringify(error instanceof Error ? error.stack : error),
  );
  throw error;
}
