const OutputGenerator = require('./lib/output-generator')
const defaultConfig = require('./lib/default-config')

/**
 * This is the entry point for your Probot App.
 * @param {import('probot').Application} app - Probot's Application class.
 */
module.exports = app => {
  app.on('check_suite.requested', async context => {
    const timeStart = new Date()

    // Only act on one pull request (for now)
    const pr = context.payload.check_suite.pull_requests[0]
    if (!pr) return

    // Get the files in the PR
    const { data: files } = await context.github.pullRequests.getFiles(context.repo({
      number: pr.number,
      per_page: 100
    }))

    // We only care about .md and .txt files that have been changed or added
    const filesWeCareAbout = files.filter(file => {
      const rightFormat = file.filename.endsWith('.md') || file.filename.endsWith('.txt')
      const rightStatus = file.status === 'added' || file.status === 'modified'
      return rightFormat && rightStatus
    })

    if (filesWeCareAbout.length === 0) {
      // No markdown files or txt files - give 'em a neutral message.
      return context.github.checks.create(context.repo({
        name: 'prosebot',
        head_sha: context.payload.check_suite.head_sha,
        head_branch: context.payload.check_suite.head_branch,
        started_at: timeStart,
        completed_at: new Date().toISOString(),
        conclusion: 'neutral',
        output: {
          title: 'No relevant files',
          summary: 'There were no `.md` or `.txt` files that needed checking.'
        }
      }))
    }

    // Get the repo's config file
    const config = await context.config('prosebot.yml', defaultConfig)

    // Prepare a map of files, filename => contents
    const fileMap = new Map()
    await Promise.all(filesWeCareAbout.map(async file => {
      const contents = await context.github.repos.getContent(context.repo({
        path: file.filename,
        ref: context.payload.check_suite.head_branch
      }))

      const decoded = Buffer.from(contents.data.content, 'base64').toString('utf8')
      fileMap.set(file.filename, decoded)
    }))
    context.log.debug('Filemap', fileMap)

    // Create the generator instance
    const generator = new OutputGenerator(fileMap, config, context.log)

    // Generate the output
    return generator.buildAllResults(context)
  })
}
