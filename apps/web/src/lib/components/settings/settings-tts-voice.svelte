<script lang="ts">
  import { faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
  import Ripple from '$lib/components/ripple.svelte';
  import {
    groupSpeechVoicesByCountry,
    previewSpeechVoice
  } from '$lib/components/book-reader/book-reader-tts/text-to-speech';
  import { inputClasses } from '$lib/css-classes';
  import { dummyFn } from '$lib/functions/utils';
  import { onDestroy } from 'svelte';
  import Fa from 'svelte-fa';

  export let selectedVoiceURI: string;
  export let rate = 1;
  export let voices: SpeechSynthesisVoice[] = [];

  $: voicesByCountry = groupSpeechVoicesByCountry(voices);

  onDestroy(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  });

  function preview() {
    previewSpeechVoice(selectedVoiceURI, rate);
  }
</script>

<div class="flex items-end gap-2">
  <select class="{inputClasses} min-w-0 flex-1 cursor-pointer" bind:value={selectedVoiceURI}>
    <option value="">Auto (Japanese)</option>
    {#each voicesByCountry as group (group.country)}
      <optgroup label={group.country}>
        {#each group.voices as voice (voice.voiceURI)}
          <option value={voice.voiceURI}>{voice.name}</option>
        {/each}
      </optgroup>
    {/each}
  </select>
  <div
    tabindex="0"
    role="button"
    title="Preview selected voice"
    class="mb-0.5 flex h-10 shrink-0 cursor-pointer items-center justify-center px-3 opacity-70 hover:opacity-100"
    on:click={preview}
    on:keyup={dummyFn}
  >
    <Fa icon={faVolumeHigh} />
    <Ripple />
  </div>
</div>
{#if !voices.length}
  <p class="mt-2 text-sm opacity-70">No system voices loaded yet. Open this page again if the list stays empty.</p>
{/if}
