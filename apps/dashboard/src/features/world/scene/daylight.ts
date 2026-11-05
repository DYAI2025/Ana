/**
 * Day and night on the globe (decoration, no data): a thin shell just above the land darkens the half of the Earth
 * that faces away from the sun, with a soft edge and a faint warm band along the twilight line. The sun's position is
 * the approximate subsolar point for the real UTC time: declination from the day of the year, longitude from the time
 * of day plus the equation of time. That is good to about a degree, plenty for "it is getting dark there now".
 */
import * as THREE from "three";
import { ll, R } from "./kit";

const DAY_MS = 86_400_000;

/** The point on Earth where the sun is straight overhead at `now` (degrees; lon in [-180, 180)). */
export function subsolarPoint(now: Date): { lat: number; lon: number } {
  const dayOfYear = (now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / DAY_MS;
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365.24) * (dayOfYear + 10));
  const b = ((2 * Math.PI) / 364) * (dayOfYear - 81);
  const equationOfTimeHours = (9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)) / 60;
  const utcHours = (now.getTime() % DAY_MS) / 3_600_000;
  const lon = -15 * (utcHours - 12 + equationOfTimeHours);
  return { lat, lon: ((((lon + 180) % 360) + 360) % 360) - 180 };
}

export interface Daylight {
  /** add to the same group as the globe, so the sun direction is in the globe's own frame */
  shell: THREE.Mesh;
  /** move the night side to the sun position at `now` */
  update(now: Date): void;
}

export function buildDaylight(): Daylight {
  const uniforms = {
    sun: { value: new THREE.Vector3(1, 0, 0) },
    nightColor: { value: new THREE.Color(0x0c1430) },
    duskColor: { value: new THREE.Color(0xf2925f) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sun;
      uniform vec3 nightColor;
      uniform vec3 duskColor;
      varying vec3 vDir;
      void main() {
        // sine of the sun's elevation: 1 = noon overhead, 0 = sunset line, -1 = midnight
        float elevation = dot(normalize(vDir), sun);
        // soft edge from about 6 deg of sun above the horizon to 13 deg below it
        float dark = 1.0 - smoothstep(-0.22, 0.10, elevation);
        // a faint warm band along the twilight line
        float dusk = exp(-pow(elevation / 0.08, 2.0)) * 0.28;
        vec3 color = mix(duskColor, nightColor, dark);
        float alpha = max(dark * 0.58, dusk * (1.0 - dark));
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }`,
  });
  // just above the tallest land tile (R + 0.15), below the figures, the office and Ana's island
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R + 0.17, 96, 64), material);
  shell.name = "night";
  shell.renderOrder = 1;
  shell.raycast = () => {};
  const update = (now: Date) => {
    const p = subsolarPoint(now);
    ll(p.lat, p.lon, 1, uniforms.sun.value).normalize();
  };
  update(new Date());
  return { shell, update };
}
