(() => {
  "use strict";
  window.Kiosk = {};
  // Prices and all calculations are integer centavos, never floating-point pesos.
  const products = Object.freeze([
    {
      id: "coffee",
      name: "Coffee",
      price: 4500,
      description: "Your daily pick-me-up",
    },
    {
      id: "sandwich",
      name: "Sandwich",
      price: 5000,
      description: "A little lunch-time fuel",
    },
    {
      id: "soda",
      name: "Soft Drink",
      price: 3500,
      description: "Chilled & refreshing",
    },
    {
      id: "cookies",
      name: "Cookies",
      price: 2500,
      description: "A sweet study companion",
    },
    {
      id: "water",
      name: "Bottled Water",
      price: 2000,
      description: "Stay hydrated, stay focused",
    },
    {
      id: "chocolate",
      name: "Chocolate",
      price: 2500,
      description: "For your well-earned break",
    },
    {
      id: "notebook",
      name: "Campus Notebook",
      price: 6500,
      description: "Big ideas start here",
    },
    {
      id: "pen",
      name: "Ballpoint Pen",
      price: 1500,
      description: "Ready for the next lecture",
    },
  ]);
  const paymentMethods = ["Cash", "QR Payment", "Credit/Debit Card"];

  Object.assign(window.Kiosk, { products, paymentMethods });
})();
