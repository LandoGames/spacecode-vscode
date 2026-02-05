// @ts-nocheck

export function createSkillsPanelHandlers(deps) {
  const {
    vscode,
    escapeHtml,
  } = deps;

  let skillsList = [];
  let skillsFilter = 'all';

  function refreshSkills() {
    vscode.postMessage({ type: 'getSkills' });
  }

  function createSkill() {
    vscode.postMessage({ type: 'openSkillCreator' });
  }

  function filterSkills(category) {
    skillsFilter = category;
    document.querySelectorAll('.skills-categories .category-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });
    renderSkillsList(skillsList);
  }

  function renderSkillsList(skills) {
    skillsList = skills || [];
    const listEl = document.getElementById('skillsList');
    if (!listEl) return;

    let filtered = skillsList;
    if (skillsFilter !== 'all') {
      filtered = skillsList.filter(s => s.category === skillsFilter);
    }

    if (!Array.isArray(filtered) || filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-skills"><div class="empty-icon">⚡</div><p>No skills ' + (skillsFilter !== 'all' ? 'in "' + skillsFilter + '" category' : 'yet') + '</p><p class="empty-hint">Skills let you save and reuse common AI tasks</p></div>';
      return;
    }

    listEl.innerHTML = filtered.map(s => {
      return '<div class="skill-card" data-skill-id="' + s.id + '">' +
        '<div class="skill-header">' +
        '<span class="skill-name">' + escapeHtml(s.name) + '</span>' +
        '<span class="skill-category">' + escapeHtml(s.category || 'custom') + '</span>' +
        '</div>' +
        '<div class="skill-description">' + escapeHtml(s.description || '') + '</div>' +
        '<div class="skill-actions">' +
        '<button class="btn-primary btn-sm" onclick="runSkill(\'' + s.id + '\')">Run</button>' +
        '<button class="btn-secondary btn-sm" onclick="editSkill(\'' + s.id + '\')">Edit</button>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  function runSkill(skillId) {
    vscode.postMessage({ type: 'runSkill', skillId });
  }

  function editSkill(skillId) {
    vscode.postMessage({ type: 'editSkill', skillId });
  }

  return {
    refreshSkills,
    createSkill,
    filterSkills,
    renderSkillsList,
    runSkill,
    editSkill,
  };
}
