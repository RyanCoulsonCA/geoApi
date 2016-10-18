'use strict';
const TOO_MANY_LAYERS = 12;

/**
 * Generate all permutations of length M, with exactly N `true` values.
 *
 * @function
 * @param {int} M the size of the array (must be greater than 0)
 * @param {int} N the number of entries which should be true (must not be greater than M)
 * @return an array containing all possible size M arrays of boolean values with N true entries
 */
function allComb(M, N) {
    const maxTrue = N;
    const maxFalse = M - N;
    const C = [[[[]]]]; // C[m][n] is the solution to all_comb(m,n), C[0][0] starts with an empty array
    for (let m = 1; m <= M; ++m) {
        C[m] = [];
        for (let n = 0; n <= m; ++n) {
            // if this would place more than the max number of true or false values we don't need this part of the array
            if (n > maxTrue || (m - n) > maxFalse) { continue; }

            const a = n > 0 ? C[m - 1][n - 1].map(x => x.concat(true)) : [];
            const b = m > n ? C[m - 1][n].map(x => x.concat(false)) : [];

            C[m][n] = a.concat(b);
        }
    }
    return C[M][N];
}

function packLayersIntoSections(layers, sections) {
    const potentialSplits = layers.length - 1;
    const requiredSplits = sections - 1;

    const permutations = allComb(potentialSplits, requiredSplits);
    let bestHeight = Number.MAX_VALUE;
    let bestPerm = null;
    const heights = Array(sections);

    permutations.forEach(perm => {
        heights.fill(0);
        let curSec = 0;
        layers.forEach((l, i) => {
            heights[curSec] += l.height;
            if (perm[i]) {
                ++curSec;
            }
        });
        const h = Math.max(...heights);
        if (h <= bestHeight) {
            bestHeight = h;
            bestPerm = perm;
        }
    });
    layers[0].splitBefore = false;
    bestPerm.forEach((split, i) => layers[i + 1].splitBefore = split);
    return layers;
}

function makeLegend(layerList, sectionsAvailable) {
    if (layerList.length > TOO_MANY_LAYERS) {
        return { layerList, sectionsUsed: 1 };
    }
    if (layerList.length <= sectionsAvailable) {
        // return allocateLayersToSections(layerList);
        return { layerList, sectionsUsed: 1 };
    } else {
        return packLayersIntoSections(layerList, sectionsAvailable);
    }
}

module.exports = () => ({ makeLegend, allComb });