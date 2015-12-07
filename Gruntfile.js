'use strict';

module.exports = function(grunt) {
    var packageJSON = require('./package.json');
    var versionJSONFile = 'app/config/version.json';

    grunt.initConfig({
        bower: {
            cleanup: {
                options: {
                    targetDir: "app/lib",
                    layout: "byComponent",
                    cleanTargetDir: true,
                    cleanBowerDir: true,
                    install: false,
                    copy: false
                }
            },
            install: {
                options: {
                    targetDir: "app/lib",
                    layout: "byComponent",
                    cleanTargetDir: true,
                    cleanBowerDir: true,
                    install: true,
                    copy: true
                }
            }
        },

        clean: {
            lib: ["app/lib"],
            docs: ["docs"],
            war: ["target"],
            tests: ["reports"],
            less: ["app/css/app.css"]
        },

        "git-describe": {
            options: {
                failOnError: false
            },
            neonGTDVersion: {
                tags: true,
                all: true,
                template: '{%=tag%}-{%=since%}-{%=object%}'
            }
        },

        jshint: {
            options: {
                jshintrc: '.jshintrc',
                force: true
            },
            console: [
                'Gruntfile.js',
                'app/js/*.js',
                'app/js/**/*.js',
                'test/**/*.js',
                '!app/js/vendor/**/*.js'
            ],
            xml: {
                options: {
                    reporter: "jslint",
                    reporterOutput: "reports/jslint.xml"
                },
                files: {
                    src: [
                        'Gruntfile.js',
                        'app/js/*.js',
                        'app/js/**/*.js',
                        'test/**/*.js',
                        '!app/js/vendor/**/*.js'
                    ]
                }
            }
        },

        jscs: {
            options: {
                config: ".jscsrc",
                excludeFiles: ["app/js/vendor/**/*.js"],
                force: true
            },
            console: {
                options: {
                    reporter: 'console'
                },
                files: {
                    src: ['Gruntfile.js', 'app/js/**/*.js', 'test/**/*.js']
                }
            },
            xml: {
                options: {
                    reporterOutput: 'reports/jscs.xml',
                    reporter: 'checkstyle'
                },
                files: {
                    src: ['Gruntfile.js', 'app/js/**/*.js', 'test/**/*.js']
                }
            }
        },

        karma: {
            unit: {
                options: {
                    configFile: 'karma.conf.js'
                }
            }
        },

        less: {
            options: {
                dumpLineNumbers: 'comments',
                paths: [
                    'app/components'
                ]
            },
            themeDarkGreen: {
                files: {
                    'app/css/dark-green.css': 'app/css/theme-green-on-dark.less'
                }
            },
            themeLightGreen: {
                files: {
                    'app/css/light-green.css': 'app/css/theme-green-on-light.less'
                }
            },
            themeDarkPurple: {
                files: {
                    'app/css/dark-purple.css': 'app/css/theme-purple-on-dark.less'
                }
            }
        },

        /*
         * Build a WAR (web archive) without Maven or the JVM installed.
         */
        war: {
            target: {
                options: {
                    war_dist_folder: "target",
                    war_verbose: true,
                    war_name: 'neon-gtd-' + packageJSON.version,
                    webxml_welcome: 'index.html',
                    webxml_display_name: packageJSON.shortDescription,
                    webxml_mime_mapping: [{
                        extension: 'woff',
                        mime_type: 'application/font-woff'
                    }]
                },
                files: [
                    {
                        expand: true,
                        cwd: ".",
                        src: [
                            "app/**",
                            "!**/*.less"],
                        dest: ""
                    }
                ]
            }
        },

        yuidoc: {
            compile: {
                name: packageJSON.shortDescription,
                description: packageJSON.description,
                version: packageJSON.version,
                url: packageJSON.repository.url,
                logo: '../app/img/Neon_60x34.png',
                options: {
                    paths: 'app/js',
                    exclude: "vendor",
                    outdir: 'docs'
                }
            }
        },

        watch: {
            less: {
                files: ['app/css/**/*.less'],
                tasks: ['compile-less'],
                options: {
                    spawn: false
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-bower-task');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-yuidoc');
    grunt.loadNpmTasks('grunt-git-describe');
    grunt.loadNpmTasks('grunt-jscs');
    grunt.loadNpmTasks('grunt-karma');
    grunt.loadNpmTasks('grunt-war');

    grunt.registerTask('compile-less', ['clean:less', 'less:themeLightGreen', 'less:themeDarkGreen', 'less:themeDarkPurple']);
    grunt.registerTask('saveRevision', function() {
        grunt.event.once('git-describe', function(rev) {
            var date = new Date(Date.now()).toISOString();
            date = date.replace(/-/g, '.').replace(/T.*/, '');

            var versionObj = {
                name: packageJSON.name,
                version: packageJSON.version + '-' + rev[2] + '-g' + rev[3] + '-' + date
            };
            grunt.file.write(versionJSONFile, JSON.stringify(versionObj));
        });
        grunt.task.run('git-describe');
    });
    grunt.registerTask('test', ['jshint:console', 'jscs:console', 'karma']);
    grunt.registerTask('default', ['clean', 'bower:install', 'saveRevision', 'jshint:xml', 'jscs:xml', 'yuidoc', 'compile-less', 'war']);
};
