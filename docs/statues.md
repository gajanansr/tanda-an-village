# Statues and murtis

The village has four sculpted figures:

| Id | Who | Where |
|---|---|---|
| `shivaji` | Chhatrapati Shivaji Maharaj on horseback, in bronze | the Shivaji chowk at the village gate, where the lanes leave the Jalna road |
| `naik` | Vasantrao Naik, in bronze | the chowk, in front of Sitabai's |
| `sevalal` | Sant Sevalal Maharaj, in white | inside the Sevalal Maharaj mandir |
| `hanuman` | Hanuman, in sindoor | inside the Hanuman mandir |

Each is drawn first as a figure modelled in code (`src/client/scene/statues.ts` and
`src/client/scene/village.ts`), so the village is never missing one. If a 3D scan is listed in
`public/statues/statues.json`, it replaces that figure: it's scaled to the given height, set on the
pedestal and centred. The pedestals, plaques, garlands and flags stay.

## Adding a scan

1. Put the file in `public/statues/`. A GLB keeps its own textures; an STL takes one of the
   finishes below. Keep each file under about 8 MB (decimate a dense scan to 50–150k triangles in
   Blender first: *Modifiers → Decimate*).
2. List it in `public/statues/statues.json`:

```json
{
  "shivaji": { "file": "shivaji.glb", "height": 3.4, "material": "bronze", "rotY": 0, "credit": "Author, CC BY 4.0, link" },
  "hanuman": { "file": "hanuman.glb", "height": 1.3, "material": "keep" }
}
```

- `height`: metres from the base to the top. The modelled ones are Shivaji 3.4 (to the sword's
  tip), Naik 1.8, Sevalal 1.4, Hanuman 1.4.
- `material`: `bronze`, `marble` or `sindoor` repaints the whole model; `keep` uses the GLB's own
  textures (best for a photo-scan whose realism is in its colour).
- `rotY`: turn it (radians) if it doesn't face the right way. The figure should face the plaque.
- Add the credit to `public/statues/CREDITS.md` too: CC BY and CC BY-SA need it.

## The models in the game now

All four were generated on this Mac with Hunyuan3D-2 mini from Wikimedia Commons photographs; see
`public/statues/CREDITS.md` for the photos and their licences. To make another, or remake one
from a better photo:

1. Pick a clear photo of the whole statue against a plain background, freely licensed, ideally
   front-on (side-on for a horseback statue).
2. Run the generator (Python 3.11, PyTorch with MPS, and `transformers==4.48.3` /
   `diffusers==0.32.2`: newer versions break the model's image encoder). The pipeline is
   `Hunyuan3DDiTFlowMatchingPipeline.from_pretrained("tencent/Hunyuan3D-2mini",
   subfolder="hunyuan3d-dit-v2-mini", variant="fp16", device="mps")`, 30 steps at octree
   resolution 320, then `FaceReducer` to 60k faces. About 3 minutes a statue on an M4 Pro.
3. The model faces the photo's camera (+z); a side-on photo with the head to the right faces +x
   (`"rotY": -1.5708`).

A photo crowded with garlands or draped cloth gives a shapeless lump. Use one where the figure stands clear.

## Other models (searched October 2026)

No free, openly licensed scan exists for **Vasantrao Naik** or **Sant Sevalal Maharaj**, and there's
no free photo-real **equestrian** Shivaji Maharaj. These are the usable ones; all need a free account
to download.

**Shivaji Maharaj**
- Bust by Kikoo3Dlab, CC BY-SA, MakerWorld: https://makerworld.com/en/models/2772083. The best-looking free option, but a bust, not on horseback.
- Seated murti scan by lonewolf37, CC BY, Sketchfab (about 1M faces; a relief on a backing plate): https://sketchfab.com/3d-models/chhatrapati-shivaji-maharaj-ea51d4ed7553467aa489bdefa5269385
- Bust by lonewolf37, CC BY, Sketchfab (34k faces): https://sketchfab.com/3d-models/chattrapati-shivaji-maharaj-11233275ede544fbb1a3bb9c6c32fcb7
- Standing figure with sword and shela by Gauri Rokade, Printables: https://www.printables.com/model/1649017. The best sculpt, but its licence forbids sharing the file. Only with the author's written permission.

**Hanuman**
- Seated murti, a real photo-scan, by Addere Creations, CC BY, Sketchfab (145k faces): https://sketchfab.com/3d-models/hanumananjaneya-idol-1d75f15d1cba49738c1a13e9e2846cb0
- Temple-style murti by Francesco Coldesina, CC BY, Sketchfab (70k faces): https://sketchfab.com/3d-models/hanuman-692bf92d2103452a9c7c10c16d6cc69f
- Gold statuette scan by evan4129, CC BY, Sketchfab (5k faces, its realism is in the texture: use `"material": "keep"`): https://sketchfab.com/3d-models/hanuman-statuette-scan-5fc1bad5d5ae4ce2a592e6ee47be0b44

Avoid anything marked NC or ND, or under a "Standard Digital File License": they don't allow a public
game to ship the file.

**For Vasantrao Naik, Sevalal Maharaj and an equestrian Shivaji**, the options are an image-to-3D
tool (Meshy, Tripo, Hunyuan3D) from reference photos you have the rights to, or a commissioned
sculpt.
