module.exports = function (grunt) {

	grunt.loadNpmTasks('grunt-ts')

	grunt.initConfig({
		ts: {
			lib: {                                 // a particular target
				src: "cellar.ts",        // The source typescript files, http://gruntjs.com/configuring-tasks#files
				options: {                    // use to override the default options, http://gruntjs.com/configuring-tasks#options
					target: 'es5',         // 'es3' (default) | 'es5'
					module: 'commonjs',       // 'amd' (default) | 'commonjs'
					declaration: false,       // true | false  (default)
					verbose: true
				},
        "watch": "cellar.ts"
			}
		}
	})

	grunt.registerTask('default', 'ts');
}