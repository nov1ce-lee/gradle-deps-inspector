const { createApp, ref, computed, watch, nextTick, onMounted } = Vue;

createApp({
    setup() {
        const rawInput = ref('');
        const hasData = ref(false);
        const treeData = ref([]);
        const searchQuery = ref('');
        const selectedIdx = ref(-1);
        const currentMatchIdx = ref(0);
        
        const generatorExpanded = ref(true);
        const moduleName = ref('');
        const selectedConfig = ref('');
        const extraParams = ref({ insight: false, writeToFile: false });
        const insightDependency = ref('');
        const copiedIndex = ref(-1);

        // 虚拟列表状态
        const itemHeight = 40; // 紧凑高度 (匹配 CSS 中的 .tree-line height)
        const containerHeight = ref(800);
        const scrollTop = ref(0);
        const scrollContainer = ref(null);

        const totalHeight = computed(() => treeData.value.length * itemHeight);
        const visibleCount = computed(() => Math.ceil(containerHeight.value / itemHeight) + 10);
        const startIndex = computed(() => Math.floor(scrollTop.value / itemHeight));
        const offsetY = computed(() => startIndex.value * itemHeight);
        
        const visibleNodes = computed(() => {
            return treeData.value.slice(startIndex.value, startIndex.value + visibleCount.value).map((node, i) => ({
                ...node,
                originalIdx: startIndex.value + i
            }));
        });

        const handleScroll = (e) => {
            scrollTop.value = e.target.scrollTop;
        };

        onMounted(() => {
            lucide.createIcons();
            window.addEventListener('resize', () => {
                if (scrollContainer.value) containerHeight.value = scrollContainer.value.clientHeight;
            });
        });

        const matchIndices = computed(() => {
            if (!searchQuery.value || searchQuery.value.length < 2) return [];
            const q = searchQuery.value.toLowerCase();
            return treeData.value.reduce((acc, node, idx) => {
                if (node.fullName.toLowerCase().includes(q)) acc.push(idx);
                return acc;
            }, []);
        });
        const matchCount = computed(() => matchIndices.value.length);

        watch(searchQuery, () => {
            currentMatchIdx.value = 0;
            if (matchCount.value > 0) scrollToNode(matchIndices.value[0]);
        });

        const scrollToNode = (idx) => {
            selectedIdx.value = idx;
            updatePathHighlight(idx);
            
            nextTick(() => {
                const targetScroll = idx * itemHeight - (containerHeight.value / 2) + (itemHeight / 2);
                if (scrollContainer.value) {
                    scrollContainer.value.scrollTo({
                        top: Math.max(0, targetScroll),
                        behavior: 'smooth'
                    });
                }
                setTimeout(() => lucide.createIcons(), 100);
            });
        };

        const updatePathHighlight = (idx) => {
            treeData.value.forEach(n => n.isInPath = false);
            if (idx < 0) return;
            let currentLevel = treeData.value[idx].level;
            for (let i = idx; i >= 0; i--) {
                if (treeData.value[i].level < currentLevel) {
                    treeData.value[i].isInPath = true;
                    currentLevel = treeData.value[i].level;
                }
            }
        };

        const process = () => {
            const lines = rawInput.value.split('\n');
            const tree = [];
            const pathStack = [];
            
            lines.forEach((line) => {
                const cleaned = line.replace(/\x1B\[[0-9;]*m/g, '').trimEnd();
                if (!cleaned) return;

                const match = cleaned.match(/^([| \t+-\\]*)([a-zA-Z0-9._-]+):([a-zA-Z0-9._-]+):([a-zA-Z0-9._-]+)(.*)$/);
                
                if (match) {
                    const [_, symbols, group, artifact, version, rest] = match;
                    const level = symbols.length / 5;
                    const targetVersion = rest.includes('->') ? rest.match(/->\s+([\d\.]+[\w\.-]*)/)?.[1] : null;
                    
                    const node = {
                        level, 
                        prefix: symbols.replace(/[a-zA-Z]/g, ''),
                        group, artifact, version, targetVersion,
                        fullName: `${group}:${artifact}`,
                        hasConflict: rest.includes('->'),
                        isOmitted: rest.includes('(*)'),
                        isInPath: false,
                        parentPath: [...pathStack.slice(0, level)]
                    };
                    pathStack[level] = artifact;
                    tree.push(node);
                }
            });

            treeData.value = tree;
            hasData.value = true;
            generatorExpanded.value = false;
            
            nextTick(() => {
                if (scrollContainer.value) containerHeight.value = scrollContainer.value.clientHeight;
                lucide.createIcons();
            });
        };

        const generatedCommands = computed(() => {
            const commands = [];
            if (!moduleName.value.trim()) return commands;
            const module = moduleName.value.trim();
            const bin = './gradlew';
            
            let baseCmd = `${bin} :${module}:dependencies`;
            if (selectedConfig.value) baseCmd += ` --configuration ${selectedConfig.value}`;
            if (extraParams.value.writeToFile) baseCmd += ` > deps.txt`;
            commands.push({ label: '📦 基础依赖树命令', command: baseCmd });
            
            if (extraParams.value.insight && insightDependency.value.trim()) {
                let insightCmd = `${bin} :${module}:dependencyInsight --dependency ${insightDependency.value.trim()}`;
                if (selectedConfig.value) insightCmd += ` --configuration ${selectedConfig.value}`;
                commands.push({ label: '🔍 深度分析命令 (Insight)', command: insightCmd });
            }
            return commands;
        });
        
        const copyToClipboard = async (text, idx) => {
            try {
                await navigator.clipboard.writeText(text);
                copiedIndex.value = idx;
                setTimeout(() => { copiedIndex.value = -1; }, 2000);
            } catch (err) {
                const el = document.createElement('textarea');
                el.value = text;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                copiedIndex.value = idx;
                setTimeout(() => { copiedIndex.value = -1; }, 2000);
            }
        };

        const reset = () => {
            hasData.value = false;
            rawInput.value = '';
            treeData.value = [];
            selectedIdx.value = -1;
            searchQuery.value = '';
            generatorExpanded.value = true;
            nextTick(() => lucide.createIcons());
        };

        return {
            rawInput, hasData, treeData, searchQuery, selectedIdx, currentMatchIdx, matchCount,
            moduleName, selectedConfig, extraParams, insightDependency, generatedCommands, copiedIndex,
            generatorExpanded, process, reset, copyToClipboard,
            // 虚拟列表
            scrollContainer, handleScroll, visibleNodes, totalHeight, offsetY,
            // 逻辑
            nextMatch: () => { if (matchCount.value > 0) { currentMatchIdx.value = (currentMatchIdx.value + 1) % matchCount.value; scrollToNode(matchIndices.value[currentMatchIdx.value]); }},
            prevMatch: () => { if (matchCount.value > 0) { currentMatchIdx.value = (currentMatchIdx.value - 1 + matchCount.value) % matchCount.value; scrollToNode(matchIndices.value[currentMatchIdx.value]); }},
            selectNode: (idx) => { selectedIdx.value = idx; updatePathHighlight(idx); nextTick(() => lucide.createIcons()); },
            isMatch: (n) => searchQuery.value && n.fullName.toLowerCase().includes(searchQuery.value.toLowerCase()),
            isCurrentFocus: (idx) => matchIndices.value[currentMatchIdx.value] === idx && searchQuery.value,
            selectedNode: computed(() => treeData.value[selectedIdx.value]),
            currentPath: computed(() => { const n = treeData.value[selectedIdx.value]; return n ? [...n.parentPath, n.artifact] : []; }),
            instances: computed(() => { const n = treeData.value[selectedIdx.value]; if (!n) return []; return treeData.value.filter(item => item.fullName === n.fullName && item !== n).map(i => ({v: i.targetVersion || i.version, parent: i.parentPath[i.parentPath.length-1] || 'Root'})); })
        };
    }
}).mount('#app');
