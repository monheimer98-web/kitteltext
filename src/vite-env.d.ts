/// <reference types="vite/client" />

// JSON-Importe (Katalog-Korpus)
declare module "*.json" {
  const value: any;
  export default value;
}
