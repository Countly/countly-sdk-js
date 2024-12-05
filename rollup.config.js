
import resolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";

export default [
    {
        input: "./Countly.js",
        output: [
            {
                file: "dist/countly_esm.js",
                format: "esm",
                name: "Countly",
                sourcemap: true,
                exports: "named",
                extend: true,
                globals: { crypto: "crypto", Countly: "Countly" },
            },
            {
                file: "dist/countly_umd.js",
                format: "umd",
                name: "Countly",
                sourcemap: true,
                exports: "named",
                extend: true,
                globals: { crypto: "crypto", Countly: "Countly" },
            },
            {
                file: "dist/countly_cjs.js",
                format: "cjs",
                name: "Countly",
                sourcemap: true,
                exports: "named",
                extend: true,
                globals: { crypto: "crypto", Countly: "Countly" },
            },
        ],
        plugins: [
            resolve({
                preferBuiltins: true,
            }),
            babel({
                babelrc: false,
                presets: ["@babel/preset-env"],
                babelHelpers: "bundled",
                // plugins : ["istanbul"] // use for code coverage
            }),
        ],
    }

];