<script lang="ts">
  import { TTS_RATE_OPTIONS } from '$lib/components/book-reader/book-reader-tts/text-to-speech';
  import { inputClasses } from '$lib/css-classes';

  export let rate = 1;
  export let compact = false;

  $: options = TTS_RATE_OPTIONS.some((option) => option === rate)
    ? TTS_RATE_OPTIONS
    : [...TTS_RATE_OPTIONS, rate].sort((first, second) => first - second);

  function formatRate(value: number) {
    return `${Number.parseFloat(value.toFixed(2))}x`;
  }

  function onChange(event: Event) {
    const value = Number.parseFloat((event.currentTarget as HTMLSelectElement).value);
    rate = Number.isFinite(value) ? value : 1;
  }
</script>

<select
  class="tts-rate-select {compact
    ? 'tts-rate-select--compact cursor-pointer border-0 bg-transparent text-sm outline-none opacity-70 hover:opacity-100 xl:text-xs'
    : `${inputClasses} cursor-pointer`}"
  title="Text to speech speed"
  value={rate}
  on:change={onChange}
  on:click|stopPropagation
>
  {#each options as option (option)}
    <option value={option}>{formatRate(option)}</option>
  {/each}
</select>

<style>
  .tts-rate-select {
    color-scheme: light;
  }

  .tts-rate-select option {
    color: #111;
    background-color: #fff;
  }

  .tts-rate-select--compact {
    color: #fff;
  }
</style>
