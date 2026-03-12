import * as THREE from 'three'

/**
 * Creates a ShaderMaterial that blends the model's original base texture
 * with the paint overlay canvas texture. Includes basic diffuse lighting.
 */
export function createPaintMaterial(baseMap, paintTexture, normalMap) {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseMap: { value: baseMap },
      paintMap: { value: paintTexture },
      normalMap: { value: normalMap },
      ambientLight: { value: new THREE.Color(0.4, 0.4, 0.45) },
      lightDir1: { value: new THREE.Vector3(0.5, 0.8, 0.5).normalize() },
      lightColor1: { value: new THREE.Color(1.0, 0.98, 0.95) },
      lightDir2: { value: new THREE.Vector3(-0.5, 0.3, -0.3).normalize() },
      lightColor2: { value: new THREE.Color(0.5, 0.55, 0.7) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D baseMap;
      uniform sampler2D paintMap;
      uniform vec3 ambientLight;
      uniform vec3 lightDir1;
      uniform vec3 lightColor1;
      uniform vec3 lightDir2;
      uniform vec3 lightColor2;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        vec4 base = texture2D(baseMap, vUv);
        vec4 paint = texture2D(paintMap, vUv);

        // Blend: paint on top of base with paint alpha controlling mix
        vec3 color = mix(base.rgb, paint.rgb, paint.a * 0.8);

        // Two-light diffuse
        float diff1 = max(dot(vNormal, lightDir1), 0.0);
        float diff2 = max(dot(vNormal, lightDir2), 0.0);
        vec3 lighting = ambientLight + lightColor1 * diff1 * 0.7 + lightColor2 * diff2 * 0.3;
        vec3 lit = color * lighting;

        // Subtle glow on painted areas
        if (paint.a > 0.05) {
          lit += paint.rgb * paint.a * 0.12;
        }

        gl_FragColor = vec4(lit, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
}
