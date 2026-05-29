// Optional power-slides talk hooks.
//
// New decks can leave this file as-is and author in slides.yaml. Uncomment only
// the pieces you need when YAML/built-in slide types are no longer enough.

export default {
  // bodyStyle is CSS text applied to document.body before the deck starts.
  // bodyStyle: 'margin:0;background:#000;color:white;overflow:hidden',

  // slides(slides, PS) can theme or transform the parsed slide array.
  // slides (slides, PS) {
  //   return slides.map(slide => Object.assign({ font: 'Inter, system-ui, sans-serif' }, slide))
  // },

  // renderers add named custom slides used by `custom`/`name`/`kind`/`renderer`.
  // renderers: {
  //   demo (slide, PS) {
  //     return PS.text({
  //       title: slide.title || 'Custom renderer',
  //       subtitle: 'Rendered from talk.js'
  //     })
  //   }
  // },

  // beforeStart(PS, spec) runs once after slides.yaml is parsed and before startTalk().
  // beforeStart (PS, spec) {
  //   console.log('Starting', spec.slides.length, 'slides')
  // }
}
