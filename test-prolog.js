const pl = require("tau-prolog");
const session = pl.create();

session.consult("can_access(admin, reports). can_access(student, notes).", {
  success: () => {
    session.query("can_access(admin, X).", {
      success: () => {
        session.answer({
          success: (a) => console.log(pl.format_answer(a)),
          fail: () => console.log("Walang access"),
          error: (e) => console.log("Error:", e),
        });
      },
    });
  },
});