import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import unzipper from 'unzipper';
import { CommandService } from './command';

export interface ScannedSkill {
  name: string;
  path: string;
  isSubSkill: boolean;
}

export class ImportService {
  /**
   * Imports a repository as a whole to preserve its structure.
   */
  static async importFromGithub(repoUrl: string, hubPath: string): Promise<{ success: boolean; name: string; subSkills: ScannedSkill[] }> {
    try {
      const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'imported-repo-' + Date.now();
      const targetDir = path.join(hubPath, repoName);

      if (await fs.pathExists(targetDir)) {
        throw new Error(`Folder "${repoName}" already exists in Hub.`);
      }

      console.log(`Cloning ${repoUrl} into ${targetDir}...`);
      CommandService.git(['clone', repoUrl, targetDir], undefined, { stdio: 'ignore' });

      // Identify sub-skills without moving them
      const subSkills = await this.scanForSkills(targetDir);
      
      return { 
        success: true, 
        name: repoName,
        subSkills: subSkills
      };
    } catch (error) {
      console.error('Import failed:', error);
      throw error;
    }
  }

  /**
   * Imports a .zip or .skill archive into the Hub.
   * The archive must contain a top-level folder (or be a flat skill with SKILL.md at root).
   */
  static async importFromArchive(archivePath: string, hubPath: string): Promise<{ success: boolean; name: string; subSkills: ScannedSkill[] }> {
    const ext = path.extname(archivePath).toLowerCase();
    if (ext !== '.zip' && ext !== '.skill') {
      throw new Error(`Unsupported archive type: ${ext}. Only .zip and .skill are supported.`);
    }

    const baseName = path.basename(archivePath, ext);
    const targetDir = path.join(hubPath, baseName);
    if (await fs.pathExists(targetDir)) {
      throw new Error(`Folder "${baseName}" already exists in Hub.`);
    }

    await fs.ensureDir(targetDir);
    console.log(`Extracting ${archivePath} into ${targetDir}...`);
    await fs.createReadStream(archivePath)
      .pipe(unzipper.Extract({ path: targetDir }))
      .promise();

    // Detect single-root-wrap case: archive contained a single folder holding everything
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
    const files = entries.filter(e => e.isFile());
    if (dirs.length === 1 && files.length === 0 && !await fs.pathExists(path.join(targetDir, 'SKILL.md'))) {
      // Collapse the wrapper directory up
      const wrapper = path.join(targetDir, dirs[0].name);
      const tmp = path.join(os.tmpdir(), `skill-import-${Date.now()}`);
      await fs.move(wrapper, tmp, { overwrite: true });
      await fs.rmdir(targetDir);
      await fs.move(tmp, targetDir, { overwrite: true });
    }

    const subSkills = await this.scanForSkills(targetDir);
    return { success: true, name: baseName, subSkills };
  }

  /**
   * Recursively scans for SKILL.md files to identify skill locations.
   */
  static async scanForSkills(dirPath: string): Promise<ScannedSkill[]> {
    const skills: ScannedSkill[] = [];
    
    // Check if current dir is a skill
    if (await fs.pathExists(path.join(dirPath, 'SKILL.md'))) {
      skills.push({
        name: path.basename(dirPath),
        path: dirPath,
        isSubSkill: false
      });
      // Important: don't stop here, subfolders might have their own skills
    }

    // Scan subdirectories
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);
      const subSkills = await this.scanForSkills(fullPath);
      for (const s of subSkills) {
        s.isSubSkill = true;
        skills.push(s);
      }
    }

    return skills;
  }
}
