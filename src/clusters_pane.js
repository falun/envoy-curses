let blessed = require('blessed')
let Theme = require('./theme')
let Box = blessed.Box
let contrib = require('blessed-contrib')
let Menu = require('./menu.js')
let theme = require('./theme.js')

class ClustersPane extends Box {
  constructor(options) {
    super(options)
    this.options = options || {}
    this.screen = options.screen
    this.style = this.options.style || Theme.style.base
    this.clusters = options.clusters
    this.stats = options.stats
    this.log = options.log
    this.chartedStat = 'rq_total'
    this.availableStats = []
    this.selectedClusterName = ''
    this.tableData = {
      headers: ['cluster', 'cx act', 'rq act', 'rq total', 'members', 'healthy'],
      data: [],
    }

    /* eslint camelcase: ["error", {properties: "never"}]*/
    this.reservedHostnames = {
      default_priority: true,
      high_priority: true,
      added_via_api: true,
    }

    this.clustersTable = contrib.table({
      fg: Theme.style.table.fg,
      selectedFg: Theme.style.table.selectedFg,
      selectedBg: Theme.style.table.selectedBg,
      keys: true,
      interactive: true,
      label: 'Clusters',
      width: '50%',
      top: 3,
      height: '100%-3',
      border: {type: 'line', fg: Theme.style.table.border},
      columnSpacing: 2,
      columnWidth: [20, 8, 8, 8, 8, 8],
    })

    this.connectionsLine = contrib.line(
      {
        label: 'Stats',
        showLegend: true,
        top: 3,
        left: '50%',
        width: '50%',
        height: '100%-3',
        border: {type: 'line', fg: Theme.style.table.border},
        legend: {width: 20},
        style: Theme.style.chart,
      })

    let searchStyle = Object.assign({
      item: {
        hover: {
          bg: Theme.style.base.fg,
        },
      },
      selected: {
        bg: Theme.style.base.focus.bg,
        fg: Theme.style.base.focus.fg,
        bold: true,
      },
    }, Theme.style.base)

    this.statSearch = blessed.List({
      label: 'Stats',
      width: '50%',
      height: '50%',
      top: 'center',
      left: 'center',
      hidden: true,
      style: searchStyle,
      border: {type: 'line', fg: Theme.style.base.border.fg},
      keys: true,
      interactive: true,
    })

    this.selectStat = (s) => {
      if (s) {
        this.chartedStat = s
        this.setCharts(this.selectedClusterName)
      }
    }
    this.connectionsSeries = []

    this.setCharts = () => {
      let hostNames = this.clusters.getHostNames(this.selectedClusterName)
      let series = []
      let newStats = new Set()
      for (let i = 0; i < hostNames.length; i++) {
        if (!this.reservedHostnames[hostNames[i]]) {
          this.clusters.getStatNames(this.selectedClusterName, hostNames[i]).forEach(s => {
            newStats.add(s)
          })
          series.push({
            title: hostNames[i],
            cluster_name: this.selectedClusterName,
            stat_namespace: hostNames[i],
            stat_name: this.chartedStat,
            style: {
              line: theme.pickChartColor(i, hostNames.length),
            },
            x: [],
            y: [],
          })
        }
      }
      this.statSearch.clearItems()
      this.availableStats = Array.from(newStats).sort()
      for (let i = 0; i < this.availableStats.length; i++) {
        this.statSearch.addItem(this.availableStats[i])
        if (this.availableStats[i] === this.chartedStat) {
          this.statSearch.select(i)
        }
      }

      this.connectionsSeries = series
    }

    this.updateTableData = () => {
      let clusterNames = this.clusters.getClusterNames()
      let newTableData = []
      clusterNames.forEach(c => {
        let row = []
        if (!this.selectedClusterName) {
          this.selectedClusterName = c
          this.setCharts()
        }
        row.push(c)
        row.push(this.stats.getStat(`cluster.${c}.upstream_cx_active`))
        row.push(this.stats.getStat(`cluster.${c}.upstream_rq_active`))
        row.push(this.stats.getStat(`cluster.${c}.upstream_rq_total`))
        row.push(this.stats.getStat(`cluster.${c}.membership_total`))
        row.push(this.stats.getStat(`cluster.${c}.membership_healthy`))
        newTableData.push(row)
      })
      this.tableData.data = newTableData
    }

    this.updateChartData = () => {
      this.connectionsSeries.forEach(s => {
        let currentSeries = this.clusters.getSeries(s.cluster_name, s.stat_namespace, s.stat_name)
        if (currentSeries) {
          s.x = currentSeries.x
          s.y = currentSeries.y
        } else {
          let seriesName = `${s.cluster_name}::${s.stat_namespace}::${s.stat_name}-${currentSeries}`
          this.log.debug(`could not find series ${seriesName}`)
        }
      })
      this.connectionsLine.setLabel(`${this.selectedClusterName} - ${this.chartedStat}`)
    }

    this.updateView = () => {
      if (this.parent) {
        this.connectionsLine.setData(this.connectionsSeries)
        this.clustersTable.setData(this.tableData)
        this.screen.render()
      }
    }

    this.connectionsLine.on('attach', (el) => {
      this.clustersTable.focus()
    })

    this.clustersTable.rows.on('select', (cluster) => {
      this.selectedClusterName = cluster.content.split(/\s+/)[0]
      this.setCharts()
      this.updateChartData()
      this.updateView()
    })

    this.clusters.on('updated', () => {
      this.updateChartData()
      this.updateTableData()
      this.updateView()
    })

    this.on('element keypress', (ch, key) => {
      if (!this.detached) {
        if (key === '/' || key === '?') {
          this.statSearch.focus()
          this.statSearch.show()
          this.screen.render()
          this.statSearch.once('action', (el, selected) => {
            this.statSearch.hide();
            if (el) {
              this.selectStat(el.content)
            }
            this.clustersTable.focus()
            this.updateChartData()
            this.updateView()
          });
        }
      }
    })

    this.show = (screen) => {
      this.append(new Menu({
        screen: screen,
        selected: 'Clusters',
      }))
      this.append(this.clustersTable)
      this.append(this.connectionsLine)
      this.append(this.statSearch)
      screen.append(this)
      this.updateChartData()
      this.updateTableData()
      this.updateView()
    }
  }
}

module.exports = ClustersPane