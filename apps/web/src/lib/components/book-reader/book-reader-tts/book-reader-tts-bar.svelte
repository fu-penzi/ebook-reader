<script lang="ts">
  import {
    faBackward,
    faForward,
    faPause,
    faPlay,
    faStop
  } from '@fortawesome/free-solid-svg-icons';
  import TtsRateSelect from '$lib/components/book-reader/book-reader-tts/tts-rate-select.svelte';
  import { createEventDispatcher } from 'svelte';
  import Fa from 'svelte-fa';

  export let paused = false;
  export let rate = 1;

  const dispatch = createEventDispatcher<{
    playPause: void;
    stop: void;
    skipBack: void;
    skipForward: void;
  }>();
</script>

<div
  class="elevation-4 writing-horizontal-tb fixed inset-x-0 bottom-0 z-20 bg-gray-700 text-white"
  style="padding-bottom: env(safe-area-inset-bottom, 0px)"
  role="toolbar"
  aria-label="Text to speech"
  on:pointerdown|stopPropagation
  on:click|stopPropagation
>
  <div class="flex h-14 items-center justify-center gap-1 px-3">
    <div class="ml-1 flex h-12 items-center">
      <TtsRateSelect compact bind:rate />
    </div>
    <button
      type="button"
      title="Previous paragraph"
      class="flex h-12 w-12 items-center justify-center text-xl opacity-80 hover:opacity-100"
      on:click={() => dispatch('skipBack')}
    >
      <Fa icon={faBackward} />
    </button>
    <button
      type="button"
      title={paused ? 'Play text to speech' : 'Pause text to speech'}
      class="flex h-12 w-12 items-center justify-center text-2xl opacity-90 hover:opacity-100"
      on:click={() => dispatch('playPause')}
    >
      <Fa icon={paused ? faPlay : faPause} />
    </button>
    <button
      type="button"
      title="Next paragraph"
      class="flex h-12 w-12 items-center justify-center text-xl opacity-80 hover:opacity-100"
      on:click={() => dispatch('skipForward')}
    >
      <Fa icon={faForward} />
    </button>
    <button
      type="button"
      title="Stop text to speech"
      class="flex h-12 w-12 items-center justify-center text-xl opacity-80 hover:opacity-100"
      on:click={() => dispatch('stop')}
    >
      <Fa icon={faStop} />
    </button>
  </div>
</div>
