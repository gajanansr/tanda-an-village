# Tanda FM · the farmer's radio

The hero buys a transistor radio at Swargate ST stand on the night he takes the Lal Pari home
(see the prologue). In the game, **B** switches it on or off, **N** skips to the next song, and on a
phone it's in the ☰ menu. Songs play in a fresh shuffle and follow the game's volume.

The first two songs are also the prologue's score: **Shahar Sutla** plays over the office scene
(the layoff) and **Lal Pari** over the night bus ride. They're picked up from `public/radio/` by
those exact file names, so about a minute each is plenty. The rest are radio songs, 2–3 minutes each.

## Adding songs

1. Drop the audio files (MP3 or M4A, ideally under 4 MB each) into `public/radio/`.
2. List them in `public/radio/playlist.json`:

```json
{
  "songs": [
    { "file": "lal-pari.mp3", "title": "Lal Pari", "artist": "Tanda FM", "lang": "Marathi · Banjari" }
  ]
}
```

`file` is relative to `public/radio/`, and `title` and `artist` show in the toast when the song starts.
Until the list has songs, switching the radio on only gets static.

## The song plan

Eight songs that follow the story, from the layoff to Bail Pola. Each has a style prompt for Gemini
and a hook to build the lyrics on. They mix Marathi with Gor Boli (Banjari): check the Banjari lines
with a native speaker before release, because generated lyrics often get the dialect wrong.

| # | File | Title | Mood | Where it fits |
|---|---|---|---|---|
| 1 | `lal-pari.mp3` | **Lal Pari** | travelling, wistful | the night bus home (~1 min) |
| 2 | `shahar-sutla.mp3` | **Shahar Sutla** (The city let go) | slow, bittersweet | the layoff (~1 min) |
| 3 | `kali-mati.mp3` | **Kali Mati** (Black soil) | earthy, hopeful | ploughing Aamrai |
| 4 | `yadi-ro-geet.mp3` | **Yadi ro Geet** (Mother's song) | tender lullaby | coming home to Aai |
| 5 | `teej-aayi.mp3` | **Teej Aayi** | festive, women's chorus | the Teej mission |
| 6 | `tanda-chalo.mp3` | **Tanda Chalo** | marching caravan | the cart to the mandi |
| 7 | `mandi-bhav.mp3` | **Mandi Bhav** (Market price) | playful lavani | selling the harvest |
| 8 | `sarja-raja.mp3` | **Sarja Raja** | drums and celebration | Bail Pola |

### Gemini prompts

Paste each prompt into Gemini's music generation (or into Gemini to draft lyrics first, then generate).

**1. Lal Pari**
> A wistful Marathi travelling song with Banjara folk colour, about riding the red MSRTC ST bus
> ("Lal Pari") overnight from Pune back to a village in Jalna. Harmonium, dholki, the rattle of the
> bus as a rhythm, a male voice. Mid tempo, 92 BPM. Chorus hook: "लाल परी, ने चल घरी" (Lal Pari, take
> me home). Mention the window seat, the chai at the stand, and the city lights fading.

**2. Shahar Sutla**
> A slow, bittersweet Marathi song about losing an IT job in Pune: the HR call, a cardboard box, the
> badge that stops opening the gate. Soft guitar and harmonium, male voice, 72 BPM. It ends with a
> turn toward hope: the mother's voice on the phone saying "ये घरी, बाळा" (come home, child).

**3. Kali Mati**
> An earthy Marathi farm song about waking up a grandfather's fallow field in the black soil of
> Marathwada. Dholki, tasha, ektara, a group of men singing call and response. 100 BPM. Hook:
> "काळी माती, माझी माती" (black soil, my soil). Ploughing, the first rain, Khillari bulls.

**4. Yadi ro Geet**
> A tender Banjara lullaby-style song in Gor Boli mixed with Marathi, from a son coming home to his
> mother ("Yadi"). Female and male voices, soft dhol, flute. 68 BPM. Mirror-work, the tanda at dusk,
> the chulha smoke.

**5. Teej Aayi**
> A festive Banjara Teej song: young women carrying baskets of wheat sprouts, singing and dancing in
> a circle. A women's chorus with handclaps, dhol and bells, 118 BPM. Gor Boli with a Marathi verse.
> Bright and joyful.

**6. Tanda Chalo**
> A marching Banjara caravan song: bullock carts on the road to the mandi, as the old Lamani traders
> once travelled. Strong dhol, nagara, a male lead with a group answering, 110 BPM. Hook:
> "चालो रे तांडा" (onward, tanda).

**7. Mandi Bhav**
> A playful Marathi lavani about haggling over onion prices at the mandi: the trader lowballs and the
> farmer outsmarts him. Dholki-led, a female lead with sharp, witty lines, 124 BPM.

**8. Sarja Raja**
> A celebratory Marathi Bail Pola song honouring two Khillari bulls, Sarja and Raja, painted and
> decorated for the procession. Tasha, dhol and a brass band, a male lead and village chorus, 128 BPM.
> Hook: "सर्जा राजा, चला मिरवणुकीला" (Sarja, Raja, come to the procession).

### Before release

- Check Gemini's terms for generated music and keep a note of where each track came from in
  `public/radio/CREDITS.md`, the same way `public/textures/` and `public/people/` record theirs.
- Export at 128 kbps MP3 so the whole station stays small.
