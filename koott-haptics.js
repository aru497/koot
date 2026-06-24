/* Koott haptics — mobile web haptic feedback
   Patterns ported from haptics.lochie.me (WebHaptics library).
   Uses navigator.vibrate() — works on Android Chrome.
   iOS Safari ignores vibrate() silently (no error).
   Include before any script that calls window.koottHaptic().

   Any element with data-haptic="<preset>" fires that preset on pointerdown.
   Binding uses a single delegated listener, so elements injected AFTER load
   (dynamic community rows, search results, etc.) work with no re-scan.
*/
(function () {
  /* vibrate() patterns computed from WebHaptics presets
     Format: [on, off, on, off, ...] milliseconds            */
  var P = {
    selection: [2],
    light:     [6],
    rigid:     [10],
    soft:      [10, 10, 10, 10],
    medium:    [14, 6, 4],
    heavy:     [35],
    success:   [10, 10, 5, 65, 40],
    warning:   [16, 4, 16, 104, 12, 8, 12, 8],
    error:     [14, 6, 14, 46, 14, 6, 14, 46, 18, 2, 18, 42, 12, 8, 12, 8, 6, 4],
    nudge:     [16, 4, 16, 4, 16, 4, 16, 84, 6, 14, 6, 14, 3, 7],
  };

  function haptic(preset) {
    if (!navigator.vibrate) return;
    var pat = P[preset] || P.light;
    try { navigator.vibrate(pat); } catch (e) {}
  }

  window.koottHaptic = haptic;

  /* One delegated listener handles every [data-haptic] element, present or
     future. closest() walks up from the event target to the tagged element. */
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    var el = t && t.closest ? t.closest('[data-haptic]') : null;
    if (el) haptic(el.getAttribute('data-haptic'));
  });
})();
