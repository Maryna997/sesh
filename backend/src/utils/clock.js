// The current time, in one replaceable place. Controllers call clock.now()
// once per request; tests replace it with a fixed instant (node:test mock),
// so time-based rules can be tested without depending on the real time.
export const clock = {
  now() {
    return new Date();
  },
};
